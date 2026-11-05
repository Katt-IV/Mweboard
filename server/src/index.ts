import { isAbsolute, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

const serverDirectory = resolve(__dirname, '..');
loadEnv({ path: resolve(serverDirectory, '.env') });
if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = resolve(serverDirectory, process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

const firebaseCredential = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const adminApp = getApps()[0] ?? initializeApp(firebaseCredential
  ? { credential: cert(JSON.parse(firebaseCredential) as Parameters<typeof cert>[0]) }
  : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore(adminApp);
const app = express();
const port = Number(process.env.PORT ?? 3000);
const apiRoot = '/api';
type AuthedRequest = Request & { uid?: string };
const now = () => Timestamp.now();

app.use(cors({ origin: (process.env.CLIENT_ORIGIN ?? 'http://localhost:4200').split(','), allowedHeaders: ['Authorization', 'Content-Type'], methods: ['GET','POST','PATCH','DELETE','OPTIONS'] }));
// Keep raw bytes for Meta's HMAC signature verification.
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));

async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const match = req.header('authorization')?.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'A Firebase ID token is required.' });
  try { const token = await getAuth(adminApp).verifyIdToken(match[1]); req.uid = token.uid; next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' }); }
}
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(apiRoot, authenticate);
const uidOf = (req: AuthedRequest) => req.uid!;
const paramId = (value: string | string[]) => Array.isArray(value) ? value[0] ?? '' : value;
const validPhone = (phone: unknown): phone is string => typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone);
const cleanTags = (tags: unknown) => Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : [];

app.get(`${apiRoot}/subscribers`, async (req: AuthedRequest, res) => {
  const snapshot = await db.collection('subscribers').where('ownerUid','==',uidOf(req)).orderBy('createdAt','desc').limit(500).get();
  const search = String(req.query.search ?? '').toLowerCase(); const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25))); const page=Math.max(1,Number(req.query.page??1));
  const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Record<string, unknown>)).filter(row => !search || String(row['name'] ?? '').toLowerCase().includes(search) || String(row['phone'] ?? '').includes(search));
  res.json({ data: data.slice((page-1)*limit, page*limit), total: data.length, page, limit });
});
app.post(`${apiRoot}/subscribers`, async (req: AuthedRequest, res) => {
  const { name, phone, tags, optedIn } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || !validPhone(phone)) return res.status(400).json({ error: 'Name and a valid E.164 phone number are required.' });
  const ref = await db.collection('subscribers').add({ ownerUid: uidOf(req), name: name.trim(), phone, tags: cleanTags(tags), optedIn: optedIn === true, createdAt: now() });
  res.status(201).json({ id: ref.id });
});
app.post(`${apiRoot}/subscribers/import`, async (req: AuthedRequest, res) => {
  const rows = req.body?.subscribers;
  if (!Array.isArray(rows) || rows.length > 450) return res.status(400).json({ error: 'Provide up to 450 subscriber rows per import.' });
  let batch = db.batch(); let count = 0; let invalid = 0;
  for (const row of rows) {
    if (typeof row?.name !== 'string' || !validPhone(row.phone)) { invalid++; continue; }
    const ref = db.collection('subscribers').doc(); batch.set(ref, { ownerUid: uidOf(req), name: row.name.trim(), phone: row.phone, tags: cleanTags(row.tags), optedIn: row.optedIn === true, createdAt: now() }); count++;
  }
  if (count) await batch.commit(); res.status(201).json({ imported: count, skipped: invalid });
});
app.patch(`${apiRoot}/subscribers/:id`, async (req: AuthedRequest, res) => {
  const ref = db.collection('subscribers').doc(paramId(req.params['id'])); const doc = await ref.get();
  if (!doc.exists || doc.get('ownerUid') !== uidOf(req)) return res.sendStatus(404);
  const update: Record<string, unknown> = {};
  if (req.body.name !== undefined) { if (typeof req.body.name !== 'string' || !req.body.name.trim()) return res.status(400).json({error:'Name is required.'}); update['name'] = req.body.name.trim(); }
  if (req.body.phone !== undefined) { if (!validPhone(req.body.phone)) return res.status(400).json({error:'Phone must use E.164 format.'}); update['phone'] = req.body.phone; }
  if (req.body.tags !== undefined) update['tags'] = cleanTags(req.body.tags);
  if (req.body.optedIn !== undefined) update['optedIn'] = req.body.optedIn === true;
  await ref.update(update); res.sendStatus(204);
});
app.delete(`${apiRoot}/subscribers/:id`, async (req: AuthedRequest, res) => {
  const ref = db.collection('subscribers').doc(paramId(req.params['id'])); const doc = await ref.get();
  if (!doc.exists || doc.get('ownerUid') !== uidOf(req)) return res.sendStatus(404);
  await ref.delete(); res.sendStatus(204);
});

async function getSettings(uid: string) { const doc = await db.collection('settings').doc(uid).get(); return doc.data() ?? {}; }
async function sendTemplate(uid: string, to: string, templateName: string, language: string) {
  const settings = await getSettings(uid); const phoneNumberId = String(settings['phoneNumberId'] ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '');
  const whatsappToken = process.env.WHATSAPP_TOKEN?.trim();
  const missingVariables: string[] = [];
  if (!phoneNumberId) missingVariables.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!whatsappToken) missingVariables.push('WHATSAPP_TOKEN');
  if (missingVariables.length) {
    throw new Error(`WhatsApp is not configured. Missing environment variable(s): ${missingVariables.join(', ')}.`);
  }
  const graphVersion = process.env.GRAPH_API_VERSION ?? 'v25.0';
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, { method:'POST', headers:{ Authorization:`Bearer ${whatsappToken}`, 'Content-Type':'application/json' }, body:JSON.stringify({ messaging_product:'whatsapp', to, type:'template', template:{ name:templateName, language:{ code:language } } }) });
  const payload = await response.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `WhatsApp API returned ${response.status}`);
  return payload.messages?.[0]?.id ?? '';
}
app.put(`${apiRoot}/settings`, async (req: AuthedRequest, res) => {
  const { phoneNumberId, wabaId } = req.body ?? {};
  if (typeof phoneNumberId !== 'string' || typeof wabaId !== 'string') return res.status(400).json({ error: 'Phone Number ID and WABA ID are required.' });
  await db.collection('settings').doc(uidOf(req)).set({ ownerUid:uidOf(req), phoneNumberId:phoneNumberId.trim(), wabaId:wabaId.trim(), updatedAt:now() }, {merge:true}); res.sendStatus(204);
});
app.get(`${apiRoot}/settings`, async (req: AuthedRequest, res) => { const s = await getSettings(uidOf(req)); res.json({ phoneNumberId:s['phoneNumberId'] ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '', wabaId:s['wabaId'] ?? process.env.WHATSAPP_WABA_ID ?? '' }); });
app.post(`${apiRoot}/test-message`, async (req: AuthedRequest, res) => {
  const { to, templateName = 'hello_world', language = 'en_US' } = req.body ?? {};
  if (!validPhone(to) || typeof templateName !== 'string' || !templateName.trim()) return res.status(400).json({error:'A valid E.164 number and approved template name are required.'});
  try { const wamid = await sendTemplate(uidOf(req), to, templateName.trim(), language); res.json({wamid}); }
  catch (error) { res.status(502).json({error: error instanceof Error ? error.message : 'Message sending failed.'}); }
});

interface Campaign { ownerUid:string; name:string; templateName:string; language:string; audienceTags:string[]; scheduledAt:Timestamp|null; status:string; sent:number; delivered:number; read:number; failed:number; createdAt:Timestamp }
app.get(`${apiRoot}/campaigns`, async (req: AuthedRequest, res) => {
  const docs = await db.collection('campaigns').where('ownerUid','==',uidOf(req)).orderBy('createdAt','desc').limit(100).get();
  res.json(docs.docs.map(d => ({id:d.id,...d.data()})));
});
app.post(`${apiRoot}/campaigns`, async (req: AuthedRequest, res) => {
  const {name,templateName,language='en_US',audienceTags=[],scheduledAt}=req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || typeof templateName !== 'string' || !templateName.trim()) return res.status(400).json({error:'Campaign name and template name are required.'});
  const scheduleDate=scheduledAt?new Date(scheduledAt):null;
  if(scheduleDate && Number.isNaN(scheduleDate.getTime()))return res.status(400).json({error:'scheduledAt must be a valid date.'});
  const scheduled = scheduleDate ? Timestamp.fromDate(scheduleDate) : null;
  const data: Campaign = { ownerUid:uidOf(req),name:name.trim(),templateName:templateName.trim(),language:String(language),audienceTags:cleanTags(audienceTags),scheduledAt:scheduled,status:scheduled?'scheduled':'draft',sent:0,delivered:0,read:0,failed:0,createdAt:now() };
  const ref=await db.collection('campaigns').add(data); res.status(201).json({id:ref.id,...data});
});
app.get(`${apiRoot}/campaigns/:id/messages`, async (req: AuthedRequest, res) => {
  const campaign = await db.collection('campaigns').doc(paramId(req.params['id'])).get();
  if (!campaign.exists || campaign.get('ownerUid')!==uidOf(req)) return res.sendStatus(404);
  const docs=await campaign.ref.collection('messages').orderBy('createdAt','desc').limit(500).get(); res.json(docs.docs.map(d=>({id:d.id,...d.data()})));
});
app.get(`${apiRoot}/analytics`, async (req: AuthedRequest, res) => {
  const docs=await db.collection('campaigns').where('ownerUid','==',uidOf(req)).orderBy('createdAt','desc').limit(100).get();
  const campaigns=docs.docs.map(d=>({id:d.id,...d.data()} as Record<string, unknown>)); const totals=campaigns.reduce<{sent:number;delivered:number;read:number;failed:number}>((a,c)=>({sent:a.sent+Number(c['sent']??0),delivered:a.delivered+Number(c['delivered']??0),read:a.read+Number(c['read']??0),failed:a.failed+Number(c['failed']??0)}),{sent:0,delivered:0,read:0,failed:0});
  const cutoff=Timestamp.fromMillis(Date.now()-30*24*60*60*1000);
  const messageDocs=await db.collectionGroup('messages').where('ownerUid','==',uidOf(req)).where('createdAt','>=',cutoff).get();
  const byDay=new Map<string,{sent:number;delivered:number;read:number;failed:number}>();
  for(const message of messageDocs.docs){
    const createdAt=message.get('createdAt') as Timestamp|undefined;if(!createdAt)continue;
    const day=createdAt.toDate().toISOString().slice(0,10);const point=byDay.get(day)??{sent:0,delivered:0,read:0,failed:0};
    point.sent++;const status=String(message.get('status')??'');if(status==='delivered'||status==='read')point.delivered++;if(status==='read')point.read++;if(status==='failed')point.failed++;byDay.set(day,point);
  }
  res.json({totals, deliveryRate:totals.sent?totals.delivered/totals.sent:0, readRate:totals.sent?totals.read/totals.sent:0, failedRate:totals.sent?totals.failed/totals.sent:0,campaigns,series:[...byDay].sort(([a],[b])=>a.localeCompare(b)).map(([date,values])=>({date,...values}))});
});

const busyCampaigns = new Set<string>();
async function runCampaign(ref: FirebaseFirestore.DocumentReference) {
  if (busyCampaigns.has(ref.id)) return; busyCampaigns.add(ref.id);
  try {
    const snap=await ref.get(); const campaign=snap.data() as Campaign|undefined; if (!campaign || campaign.status!=='scheduled') return;
    await ref.update({status:'sending',startedAt:now()});
    const subscribers=await db.collection('subscribers').where('ownerUid','==',campaign.ownerUid).where('optedIn','==',true).get();
    const targets=subscribers.docs.filter(doc=>!campaign.audienceTags.length || campaign.audienceTags.some(tag=>(doc.get('tags') as string[]|undefined)?.includes(tag)));
    for (const target of targets) {
      const messageRef=ref.collection('messages').doc(target.id);
      const previousMessage=await messageRef.get();if(previousMessage.exists && previousMessage.get('status')!=='queued')continue;
      try {
        const wamid=await sendTemplate(campaign.ownerUid,target.get('phone'),campaign.templateName,campaign.language);
        await messageRef.set({ownerUid:campaign.ownerUid,phone:target.get('phone'),wamid,status:'sent',createdAt:now(),sentAt:now()});
        await ref.update({sent:FieldValue.increment(1)});
      } catch(error) {
        await messageRef.set({ownerUid:campaign.ownerUid,phone:target.get('phone'),status:'failed',error:error instanceof Error?error.message:'Send failed',createdAt:now(),failedAt:now()});
        await ref.update({failed:FieldValue.increment(1)});
      }
      await new Promise(resolve=>setTimeout(resolve,Number(process.env.MESSAGE_DELAY_MS??250)));
    }
    await ref.update({status:'completed',completedAt:now()});
  } catch(error) { console.error('Campaign execution failed',ref.id,error); await ref.update({status:'failed',error:error instanceof Error?error.message:'Campaign execution failed'}).catch(()=>undefined); }
  finally { busyCampaigns.delete(ref.id); }
}
async function processDueCampaigns() {
  const due=await db.collection('campaigns').where('status','==','scheduled').where('scheduledAt','<=',now()).get();
  for(const doc of due.docs) void runCampaign(doc.ref);
}
async function startScheduler() {
  const interrupted=await db.collection('campaigns').where('status','==','sending').get();
  for(const doc of interrupted.docs)await doc.ref.update({status:'scheduled',scheduledAt:doc.get('scheduledAt')??now()});
  await processDueCampaigns();
  cron.schedule('* * * * *',()=>void processDueCampaigns().catch(console.error));
}

app.get('/webhook', (req,res) => {
  const mode=req.query['hub.mode']; const token=req.query['hub.verify_token']; const challenge=req.query['hub.challenge'];
  if(mode==='subscribe' && token===process.env.META_VERIFY_TOKEN && typeof challenge==='string') return res.status(200).send(challenge);
  return res.sendStatus(403);
});
app.post('/webhook', async (req,res) => {
  const secret=process.env.META_APP_SECRET; const signature=req.header('x-hub-signature-256');
  if(!secret || !signature || !Buffer.isBuffer(req.body)) return res.sendStatus(401);
  const expected=`sha256=${createHmac('sha256',secret).update(req.body).digest('hex')}`;
  const supplied=Buffer.from(signature); const wanted=Buffer.from(expected);
  if(supplied.length!==wanted.length || !timingSafeEqual(supplied,wanted)) return res.sendStatus(401);
  let payload: {entry?:Array<{changes?:Array<{value?:{statuses?:Array<{id?:string;status?:string;timestamp?:string;errors?:unknown[]}>}}>}>};
  try { payload=JSON.parse(req.body.toString('utf8')) as typeof payload; } catch { return res.sendStatus(400); }
  for(const entry of payload.entry??[]) for(const change of entry.changes??[]) for(const event of change.value?.statuses??[]) {
    if(!event.id || !event.status) continue;
    const found=await db.collectionGroup('messages').where('wamid','==',event.id).limit(1).get(); if(found.empty) continue;
    const message=found.docs[0]; const status=event.status; const eventAt=event.timestamp?Timestamp.fromMillis(Number(event.timestamp)*1000):now();
    if(!['sent','delivered','read','failed'].includes(status)) continue;
    const campaign=message.ref.parent.parent; if(!campaign) continue;
    const counter=status==='delivered'?'delivered':status==='read'?'read':status==='failed'?'failed':null;
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(message.ref);const previous=String(current.get('status')??'');
      if(!current.exists || previous===status || (previous==='read'&&status==='delivered') || (status==='sent'&&['delivered','read','failed'].includes(previous)))return;
      transaction.update(message.ref,{status,[`${status}At`]:eventAt,...(status==='failed'?{error:event.errors??[]}: {})});
      const counterUpdates:Record<string,FieldValue>={};if(counter)counterUpdates[counter]=FieldValue.increment(1);
      if(status==='read'&&previous!=='delivered'&&previous!=='read')counterUpdates['delivered']=FieldValue.increment(1);
      if(Object.keys(counterUpdates).length)transaction.update(campaign,counterUpdates);
    });
  }
  res.sendStatus(200);
});

app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{console.error(error);res.status(500).json({error:'Internal server error.'});});
app.listen(port,()=>{console.log(`Whatsflow API listening on ${port}`); void startScheduler().catch(console.error);});
