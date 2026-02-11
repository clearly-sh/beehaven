// ============================================================================
// BeeHaven Office - Firebase Admin Initialization
// Uses service account from functions/serviceAccountKey.json
// ============================================================================

import admin from 'firebase-admin';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVICE_ACCOUNT_PATH = resolve(__dirname, '..', '..', 'functions', 'serviceAccountKey.json');
const PROJECT_ID = 'clearly-9bd39';

let db: admin.firestore.Firestore | null = null;

export function initFirebase(): admin.firestore.Firestore | null {
  if (db) return db;

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    console.log('[firebase] No service account found at', SERVICE_ACCOUNT_PATH);
    console.log('[firebase] Chat and project features disabled');
    return null;
  }

  try {
    if (!admin.apps?.length) {
      admin.initializeApp({
        credential: admin.credential.cert(SERVICE_ACCOUNT_PATH),
        projectId: PROJECT_ID,
      });
    }
    db = admin.firestore();
    console.log('[firebase] Connected to Firestore');
    return db;
  } catch (err) {
    console.error('[firebase] Init failed:', (err as Error).message);
    return null;
  }
}

export { admin };
