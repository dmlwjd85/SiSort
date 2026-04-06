import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { getApps, initializeApp } from 'firebase/app';
import { readFirebaseConfig } from './firebaseConfig.js';

function getFirebaseApp() {
  const cfg = readFirebaseConfig();
  if (!cfg.apiKey || !cfg.projectId) return null;
  return getApps().length ? getApps()[0] : initializeApp(cfg);
}

export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  return getAuth(app);
}

/** 브라우저·탭을 닫아도 로그인 유지(강제 종료·시크릿 모드 제외). 앱 부팅 시 한 번 await */
let persistenceReady = Promise.resolve();
let persistenceDone = false;
export function initAuthPersistence() {
  const auth = getFirebaseAuth();
  if (!auth) return Promise.resolve();
  if (persistenceDone) return persistenceReady;
  persistenceDone = true;
  persistenceReady = setPersistence(auth, browserLocalPersistence).catch((e) => {
    console.warn('[auth] 로컬 로그인 유지 설정 실패', e);
  });
  return persistenceReady;
}

/**
 * @param {string} email
 * @param {string} password
 * @param {string} displayName Firebase 프로필 표시(보통 이메일 @ 앞)
 */
export async function registerWithEmail(email, password, displayName) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase 미구성');
  const trimmed = displayName.trim();
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (trimmed) {
    await updateProfile(cred.user, { displayName: trimmed });
  }
  return cred.user;
}

export async function loginWithEmail(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase 미구성');
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  return cred.user;
}

/** 해당 이메일에 연결된 로그인 수단 목록(비어 있으면 아직 가입 없음 → 마스터 최초 설정 가능) */
export async function listSignInMethodsForEmail(email) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase 미구성');
  return fetchSignInMethodsForEmail(auth, email.trim());
}

/** 로그인 후 표시 이름만 갱신(마스터 계정 등) */
export async function updateUserDisplayName(user, displayName) {
  const auth = getFirebaseAuth();
  if (!auth || !user) return;
  const t = String(displayName || '').trim();
  if (!t) return;
  await updateProfile(user, { displayName: t });
}

export async function logoutFirebase() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await signOut(auth);
}

export function subscribeAuth(callback) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
