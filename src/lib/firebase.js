import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/**
 * Vite 환경변수로 Firebase 구성 (미설정 시 멀티플레이 비활성)
 */
function readConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

export function isFirebaseConfigured() {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
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
