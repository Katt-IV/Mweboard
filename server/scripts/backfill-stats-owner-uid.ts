// One-time Admin SDK migration to add ownerUid to legacy daily stats documents.
import { isAbsolute, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

/**
 * Initializes the Admin SDK using the same local credential options as the API server.
 * @returns The initialized Firestore database.
 */
function createFirestore() {
  const serverDirectory = resolve(__dirname, '..');
  loadEnv({ path: resolve(serverDirectory, '.env') });
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS && !isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = resolve(serverDirectory, process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const app = getApps()[0] ?? initializeApp(serviceAccount
    ? { credential: cert(JSON.parse(serviceAccount) as Parameters<typeof cert>[0]) }
    : { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID });
  return getFirestore(app);
}

/**
 * Adds ownerUid and a normalized date to stats documents that do not yet have an owner.
 * Document IDs use the existing `${ownerUid}_${YYYY-MM-DD}` layout; parsing from the end
 * preserves UIDs that themselves contain underscores.
 * @returns A promise that resolves after all paginated batches finish.
 */
async function backfillStatsOwnerUid(): Promise<void> {
  const db = createFirestore();
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let updated = 0;
  let skipped = 0;

  while (true) {
    let pageQuery = db.collection('stats').orderBy(FieldPath.documentId()).limit(400);
    if (cursor) pageQuery = pageQuery.startAfter(cursor);
    const page = await pageQuery.get();
    if (page.empty) break;

    const batch = db.batch();
    let batchUpdates = 0;
    for (const document of page.docs) {
      const ownerUid = document.get('ownerUid');
      if (typeof ownerUid === 'string' && ownerUid.length > 0) continue;

      const separator = document.id.lastIndexOf('_');
      const idOwnerUid = document.id.slice(0, separator);
      const date = document.id.slice(separator + 1);
      if (separator <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        skipped++;
        continue;
      }

      batch.update(document.ref, { ownerUid: idOwnerUid, date });
      batchUpdates++;
    }

    if (batchUpdates) {
      await batch.commit();
      updated += batchUpdates;
    }
    cursor = page.docs[page.docs.length - 1];
    if (page.size < 400) break;
  }

  console.log(`Stats ownerUid backfill complete. Updated ${updated}; skipped ${skipped} unrecognized document IDs.`);
}

void backfillStatsOwnerUid().catch(error => {
  console.error('Stats ownerUid backfill failed.', error);
  process.exitCode = 1;
});
