import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { readFirebaseConfig } from './firebaseConfig.js';

export function isFirebaseConfigured() {
  const c = readFirebaseConfig();
  return Boolean(c.apiKey && c.projectId);
}

let _db = null;
let _authPromise = null;

/** Firestore 인스턴스 (미구성 시 null) */
export function getFirestoreDb() {
  if (!isFirebaseConfigured()) return null;
  if (_db) return _db;
  const cfg = readFirebaseConfig();
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  _db = getFirestore(app);
  return _db;
}

/**
 * Firestore 쓰기 규칙이 request.auth를 요구할 때를 대비해 익명 로그인
 * (Firebase 콘솔에서 익명 로그인 사용 설정 필요)
 */
export function ensureFirebaseAuth() {
  if (!isFirebaseConfigured()) {
    return Promise.reject(new Error('Firebase 미구성'));
  }
  const app = getApps().length ? getApps()[0] : initializeApp(readFirebaseConfig());
  const auth = getAuth(app);
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  if (_authPromise) return _authPromise;
  _authPromise = signInAnonymously(auth)
    .then((cred) => cred.user)
    .catch((e) => {
      _authPromise = null;
      throw e;
    });
  return _authPromise;
}
