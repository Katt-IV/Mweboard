// Authenticated WhatsApp API, campaign delivery, webhook processing, and daily Firestore counters.
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
type DailyMetric = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Returns a Firestore timestamp for the current time.
 * @returns The current server timestamp.
 */
const now = () => Timestamp.now();

const clientOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:4200,http://127.0.0.1:4200,http://localhost:4201,http://127.0.0.1:4201').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(cors({ origin: clientOrigins, allowedHeaders: ['Authorization', 'Content-Type'], methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'] }));
// Keep raw bytes for Meta's HMAC signature verification.
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '8mb' }));

async function authenticate(req: AuthedRequest, res: Response, next: NextFunction) {
  const match = req.header('authorization')?.match(/^Bearer (.+)$/);
  if (!match) return res.status(401).json({ error: 'A Firebase ID token is required.' });
  try { const token = await getAuth(adminApp).verifyIdToken(match[1]); req.uid = token.uid; next(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Firebase ID token verification failed:', message);
    if (/EACCES|ENETUNREACH|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(message)) {
      return res.status(503).json({ error: 'The API server cannot reach Firebase Auth to verify this token.' });
    }
    return res.status(401).json({ error: 'Invalid or expired Firebase ID token.' });
  }
}
app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(apiRoot, authenticate);
const uidOf = (req: AuthedRequest) => req.uid!;
const paramId = (value: string | string[]) => Array.isArray(value) ? value[0] ?? '' : value;
const validPhone = (phone: unknown): phone is string => typeof phone === 'string' && /^\+[1-9]\d{7,14}$/.test(phone);
const cleanTags = (tags: unknown) => Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 30) : [];

/**
 * Builds a stats document reference and UTC date key for one event timestamp.
 * @param ownerUid The owner of the campaign or message.
 * @param eventAt The time the metric occurred.
 * @returns The stats document reference and its YYYY-MM-DD date.
 */
function dailyStatsDocument(ownerUid: string, eventAt: Timestamp) {
  const date = eventAt.toDate().toISOString().slice(0, 10);
  return { ref: db.collection('stats').doc(`${ownerUid}_${date}`), date };
}

/**
 * Adds only newly advanced message metrics to the owner's daily stats document.
 * @param transaction The Firestore transaction holding the message status transition.
 * @param ownerUid The message owner's Firebase UID.
 * @param eventAt The timestamp used to select the daily stats document.
 * @param increments The nonzero counters to increment.
 * @returns Nothing; merges owner/date metadata and atomic increments in the transaction.
 */
function incrementDailyStats(
  transaction: FirebaseFirestore.Transaction,
  ownerUid: string,
  eventAt: Timestamp,
  increments: Partial<Record<DailyMetric, number>>,
): void {
  const { ref, date } = dailyStatsDocument(ownerUid, eventAt);
  const update: Record<string, unknown> = {
    ownerUid,
    date,
    sent: FieldValue.increment(increments.sent ?? 0),
    delivered: FieldValue.increment(increments.delivered ?? 0),
    read: FieldValue.increment(increments.read ?? 0),
    failed: FieldValue.increment(increments.failed ?? 0),
  };
  transaction.set(ref, update, { merge: true });
}

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

/**
 * Reads a user's saved WhatsApp settings.
 * @param uid The Firebase UID whose settings are requested.
 * @returns The settings document data, or an empty object when absent.
 */
async function getSettings(uid: string) { const doc = await db.collection('settings').doc(uid).get(); return doc.data() ?? {}; }

/**
 * Resolves the credentials required for a WhatsApp Graph API request.
 * @param uid The Firebase UID whose saved phone number configuration is used.
 * @returns The phone number ID, token, and Graph API version.
 */
async function getWhatsAppConfig(uid: string) {
  const settings = await getSettings(uid); const phoneNumberId = String(settings['phoneNumberId'] ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '');
  const whatsappToken = process.env.WHATSAPP_TOKEN?.trim();
  const missingVariables: string[] = [];
  if (!phoneNumberId) missingVariables.push('WHATSAPP_PHONE_NUMBER_ID');
  if (!whatsappToken) missingVariables.push('WHATSAPP_TOKEN');
  if (missingVariables.length) {
    throw new Error(`WhatsApp is not configured. Missing environment variable(s): ${missingVariables.join(', ')}.`);
  }
  return { phoneNumberId, whatsappToken, graphVersion: process.env.GRAPH_API_VERSION ?? 'v25.0' };
}

/**
 * Sends an authenticated JSON request to the WhatsApp Graph API.
 * @param uid The Firebase UID whose WhatsApp configuration is used.
 * @param endpoint The Graph API endpoint under the configured phone number.
 * @param requestBody The JSON request body.
 * @returns The parsed WhatsApp API response.
 */
async function graphPost(uid: string, endpoint: string, requestBody: unknown) {
  const { phoneNumberId, whatsappToken, graphVersion } = await getWhatsAppConfig(uid);
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/${endpoint}`, { method:'POST', headers:{ Authorization:`Bearer ${whatsappToken}`, 'Content-Type':'application/json' }, body:JSON.stringify(requestBody) });
  const responsePayload = await response.json() as { messages?: Array<{ id: string }>; error?: { message?: string } };
  if (!response.ok) throw new Error(responsePayload.error?.message ?? `WhatsApp API returned ${response.status}`);
  return responsePayload;
}

/**
 * Uploads an image to WhatsApp and returns its media identifier.
 * @param uid The Firebase UID whose WhatsApp configuration is used.
 * @param bytes The image file bytes.
 * @param mimeType The validated image MIME type.
 * @param fileName The upload filename.
 * @returns The WhatsApp media ID.
 */
async function uploadCampaignImage(uid: string, bytes: Buffer, mimeType: string, fileName: string) {
  const { phoneNumberId, whatsappToken, graphVersion } = await getWhatsAppConfig(uid);
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', new Blob([bytes], { type: mimeType }), fileName);
  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`, { method:'POST', headers:{ Authorization:`Bearer ${whatsappToken}` }, body:form });
  const payload = await response.json() as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) throw new Error(payload.error?.message ?? `WhatsApp media upload returned ${response.status}`);
  return payload.id;
}

/**
 * Sends one campaign message to a subscriber using the campaign's configured content.
 * @param uid The campaign owner's Firebase UID.
 * @param to The recipient's phone number.
 * @param campaign The campaign message configuration.
 * @returns The WhatsApp message ID, or an empty string if none was returned.
 */
async function sendCampaignMessage(uid: string, to: string, campaign: Campaign) {
  let message: Record<string, unknown>;
  if (campaign.imageMediaId) {
    message = { messaging_product:'whatsapp', to, type:'image', image:{ id:campaign.imageMediaId, ...(campaign.messageText ? { caption:campaign.messageText } : {}) } };
  } else if (campaign.messageText) {
    message = { messaging_product:'whatsapp', to, type:'text', text:{ body:campaign.messageText, preview_url:false } };
  } else {
    message = { messaging_product:'whatsapp', to, type:'template', template:{ name:campaign.templateName, language:{ code:campaign.language } } };
  }
  const payload = await graphPost(uid, 'messages', message);
  return payload.messages?.[0]?.id ?? '';
}

/**
 * Saves the authenticated user's WhatsApp settings.
 * @param req The authenticated request with phone number and WABA IDs.
 * @param res The response receiving the save result.
 * @returns Nothing; sends no content or validation error.
 */
app.put(`${apiRoot}/settings`, async (req: AuthedRequest, res) => {
  const { phoneNumberId, wabaId } = req.body ?? {};
  if (typeof phoneNumberId !== 'string' || typeof wabaId !== 'string') return res.status(400).json({ error: 'Phone Number ID and WABA ID are required.' });
  await db.collection('settings').doc(uidOf(req)).set({ ownerUid:uidOf(req), phoneNumberId:phoneNumberId.trim(), wabaId:wabaId.trim(), updatedAt:now() }, {merge:true}); res.sendStatus(204);
});

/**
 * Returns the authenticated user's WhatsApp settings without exposing tokens.
 * @param req The authenticated request.
 * @param res The response receiving non-secret settings.
 * @returns Nothing; sends a JSON settings response.
 */
app.get(`${apiRoot}/settings`, async (req: AuthedRequest, res) => { const s = await getSettings(uidOf(req)); res.json({ phoneNumberId:s['phoneNumberId'] ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? '', wabaId:s['wabaId'] ?? process.env.WHATSAPP_WABA_ID ?? '' }); });

interface Campaign { ownerUid:string; name:string; templateName?:string; language:string; messageText?:string; imageMediaId?:string; audienceTags:string[]; scheduledAt:Timestamp|null; status:string; sent:number; delivered:number; read:number; failed:number; createdAt:Timestamp }

/**
 * Lists the authenticated user's campaigns in newest-first order.
 * @param req The authenticated request.
 * @param res The response receiving campaign documents.
 * @returns Nothing; sends a JSON campaign list.
 */
app.get(`${apiRoot}/campaigns`, async (req: AuthedRequest, res) => {
  const docs = await db.collection('campaigns').where('ownerUid','==',uidOf(req)).orderBy('createdAt','desc').limit(100).get();
  res.json(docs.docs.map(d => ({id:d.id,...d.data()})));
});

/**
 * Creates a campaign and starts an immediate custom-message campaign when appropriate.
 * @param req The authenticated request containing campaign setup and optional image data.
 * @param res The response receiving the new campaign document.
 * @returns Nothing; sends a created response or validation error.
 */
app.post(`${apiRoot}/campaigns`, async (req: AuthedRequest, res) => {
  const {name,templateName,language='en_US',audienceTags=[],scheduledAt,messageText,imageDataUrl,imageName='campaign-image'}=req.body ?? {};
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({error:'Campaign name is required.'});
  const cleanMessage = typeof messageText === 'string' ? messageText.trim() : '';
  const customMessage = Boolean(cleanMessage || imageDataUrl);
  if (customMessage && cleanMessage.length > (imageDataUrl ? 1024 : 4096)) return res.status(400).json({error:imageDataUrl?'Image captions must be 1,024 characters or fewer.':'Messages must be 4,096 characters or fewer.'});
  if (!customMessage && (typeof templateName !== 'string' || !templateName.trim())) return res.status(400).json({error:'A campaign message or approved template name is required.'});
  const scheduleDate=scheduledAt?new Date(scheduledAt):null;
  if(scheduleDate && Number.isNaN(scheduleDate.getTime()))return res.status(400).json({error:'scheduledAt must be a valid date.'});
  let imageMediaId: string | undefined;
  if (imageDataUrl) {
    if (typeof imageDataUrl !== 'string') return res.status(400).json({error:'The image upload is invalid.'});
    const match = imageDataUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return res.status(400).json({error:'Choose a JPEG or PNG image.'});
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return res.status(400).json({error:'Images must be no larger than 5 MB.'});
    try { imageMediaId = await uploadCampaignImage(uidOf(req), bytes, match[1], typeof imageName === 'string' ? imageName.slice(0, 128) : 'campaign-image'); }
    catch (error) { return res.status(502).json({error:error instanceof Error?error.message:'Image upload failed.'}); }
  }
  const scheduled = scheduleDate ? Timestamp.fromDate(scheduleDate) : null;
  const data: Campaign = { ownerUid:uidOf(req),name:name.trim(),...(customMessage?{messageText:cleanMessage}: {templateName:templateName.trim()}),...(imageMediaId?{imageMediaId}:{}),language:String(language),audienceTags:cleanTags(audienceTags),scheduledAt:customMessage?(scheduled??now()):scheduled,status:customMessage||scheduled?'scheduled':'draft',sent:0,delivered:0,read:0,failed:0,createdAt:now() };
  const ref=await db.collection('campaigns').add(data);
  if (customMessage && !scheduleDate) void runCampaign(ref);
  res.status(201).json({id:ref.id,...data});
});

/**
 * Lists messages for a campaign after verifying campaign ownership.
 * @param req The authenticated request containing the campaign ID.
 * @param res The response receiving the campaign's latest message documents.
 * @returns Nothing; sends the message list or not found.
 */
app.get(`${apiRoot}/campaigns/:id/messages`, async (req: AuthedRequest, res) => {
  const campaign = await db.collection('campaigns').doc(paramId(req.params['id'])).get();
  if (!campaign.exists || campaign.get('ownerUid')!==uidOf(req)) return res.sendStatus(404);
  const docs=await campaign.ref.collection('messages').orderBy('createdAt','desc').limit(500).get(); res.json(docs.docs.map(d=>({id:d.id,...d.data()})));
});

/**
 * Returns campaign totals and a recent message-derived daily analytics series.
 * @param req The authenticated request.
 * @param res The response receiving aggregate analytics.
 * @returns Nothing; sends a JSON analytics response.
 */
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

/**
 * Delivers a scheduled campaign and records each message's first outcome.
 * @param ref The campaign document to execute.
 * @returns A promise that resolves when delivery processing ends.
 */
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
        const wamid=await sendCampaignMessage(campaign.ownerUid,target.get('phone'),campaign);
        const sentAt=now();
        await db.runTransaction(async transaction=>{
          const current=await transaction.get(messageRef);
          if(current.exists && current.get('status')!=='queued')return;
          transaction.set(messageRef,{ownerUid:campaign.ownerUid,phone:target.get('phone'),wamid,status:'sent',createdAt:sentAt,sentAt});
          transaction.update(ref,{sent:FieldValue.increment(1)});
          incrementDailyStats(transaction,campaign.ownerUid,sentAt,{sent:1});
        });
      } catch(error) {
        const failedAt=now();
        await db.runTransaction(async transaction=>{
          const current=await transaction.get(messageRef);
          if(current.exists && current.get('status')!=='queued')return;
          transaction.set(messageRef,{ownerUid:campaign.ownerUid,phone:target.get('phone'),status:'failed',error:error instanceof Error?error.message:'Send failed',createdAt:failedAt,failedAt});
          transaction.update(ref,{failed:FieldValue.increment(1)});
          incrementDailyStats(transaction,campaign.ownerUid,failedAt,{failed:1});
        });
      }
      await new Promise(resolve=>setTimeout(resolve,Number(process.env.MESSAGE_DELAY_MS??250)));
    }
    await ref.update({status:'completed',completedAt:now()});
  } catch(error) { console.error('Campaign execution failed',ref.id,error); await ref.update({status:'failed',error:error instanceof Error?error.message:'Campaign execution failed'}).catch(()=>undefined); }
  finally { busyCampaigns.delete(ref.id); }
}

/**
 * Starts every campaign whose scheduled time has arrived.
 * @returns A promise that resolves after due campaigns have been queued for execution.
 */
async function processDueCampaigns() {
  const due=await db.collection('campaigns').where('status','==','scheduled').where('scheduledAt','<=',now()).get();
  for(const doc of due.docs) void runCampaign(doc.ref);
}

/**
 * Requeues interrupted campaigns and starts the periodic scheduler.
 * @returns A promise that resolves after startup recovery and the first due check.
 */
async function startScheduler() {
  const interrupted=await db.collection('campaigns').where('status','==','sending').get();
  for(const doc of interrupted.docs)await doc.ref.update({status:'scheduled',scheduledAt:doc.get('scheduledAt')??now()});
  await processDueCampaigns();
  cron.schedule('* * * * *',()=>void processDueCampaigns().catch(console.error));
}

/**
 * Completes Meta's webhook verification handshake using the configured verify token.
 * @param req The webhook verification request.
 * @param res The response receiving the challenge or forbidden status.
 * @returns Nothing; sends the verification result.
 */
app.get('/webhook', (req,res) => {
  const mode=req.query['hub.mode']; const token=req.query['hub.verify_token']; const challenge=req.query['hub.challenge'];
  if(mode==='subscribe' && token===process.env.META_VERIFY_TOKEN && typeof challenge==='string') return res.status(200).send(challenge);
  return res.sendStatus(403);
});

/**
 * Verifies Meta's webhook signature and advances message/campaign counters atomically.
 * @param req The raw webhook request body and signature header.
 * @param res The response acknowledging or rejecting the webhook.
 * @returns Nothing; sends the webhook result after processing statuses.
 */
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
    await db.runTransaction(async transaction=>{
      const current=await transaction.get(message.ref);const previous=String(current.get('status')??'');
      const advances=(previous==='sent'&&['delivered','read','failed'].includes(status))||(previous==='delivered'&&status==='read');
      if(!current.exists || !advances)return;
      transaction.update(message.ref,{status,[`${status}At`]:eventAt,...(status==='failed'?{error:event.errors??[]}: {})});
      const counterUpdates:Record<string,FieldValue>={};
      if(status==='delivered')counterUpdates['delivered']=FieldValue.increment(1);
      if(status==='read'){
        counterUpdates['read']=FieldValue.increment(1);
        if(previous==='sent')counterUpdates['delivered']=FieldValue.increment(1);
      }
      if(status==='failed')counterUpdates['failed']=FieldValue.increment(1);
      if(Object.keys(counterUpdates).length)transaction.update(campaign,counterUpdates);
      const metricIncrements:Partial<Record<DailyMetric,number>>={};
      if(status==='delivered')metricIncrements['delivered']=1;
      if(status==='read'){
        metricIncrements['read']=1;
        if(previous==='sent')metricIncrements['delivered']=1;
      }
      if(status==='failed')metricIncrements['failed']=1;
      incrementDailyStats(transaction,String(current.get('ownerUid')??''),eventAt,metricIncrements);
    });
  }
  res.sendStatus(200);
});

/**
 * Logs unexpected API errors and returns a generic response to callers.
 * @param error The error raised by an earlier middleware or route.
 * @param _req The request that failed.
 * @param res The response receiving the generic failure.
 * @param _next The next Express middleware callback.
 * @returns Nothing; sends an internal server error response.
 */
app.use((error:unknown,_req:Request,res:Response,_next:NextFunction)=>{console.error(error);res.status(500).json({error:'Internal server error.'});});

/**
 * Starts the HTTP server and runs scheduler recovery once listening.
 * @param port The configured TCP port.
 * @returns Nothing; starts listening and triggers startup recovery.
 */
app.listen(port,()=>{console.log(`Whatsflow API listening on ${port}`); void startScheduler().catch(console.error);});
