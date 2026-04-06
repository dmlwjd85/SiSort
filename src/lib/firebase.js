import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebasePublicConfig as pub } from '../config/firebasePublic.js';

/**
 * 환경변수(VITE_*)가 있으면 우선, 없으면 firebasePublic.js 폴백
 */
function readConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || pub.apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || pub.authDomain,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || pub.projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || pub.storageBucket,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || pub.messagingSenderId,
    appId: import.meta.env.VITE_FIREBASE_APP_ID || pub.appId,
  };
}

export function isFirebaseConfigured() {
  const c = readConfig();
  return Boolean(c.apiKey && c.projectId);
}

let _db = null;

/** Firestore 인스턴스 (미구성 시 null) */
export function getFirestoreDb() {
  if (!isFirebaseConfigured()) return null;
  if (_db) return _db;
  const cfg = readConfig();
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  _db = getFirestore(app);
  return _db;
}
