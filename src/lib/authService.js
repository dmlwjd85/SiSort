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
  EmailAuthProvider,
  reauthenticateWithCredential,
  deleteUser,
} from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { getFirestoreDb } from './firebase.js';
import { pinToFirebasePassword, isMasterAccountEmail } from './accountIdentity.js';
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

const USERS_COLLECTION = 'users';

/**
 * 회원 본인: 비밀번호(숫자 4자리) 재확인 후 Firestore 프로필 삭제 + Firebase Auth 계정 삭제
 * (앱스토어·플레이스토어 계정 삭제 노출 요건)
 */
export async function deleteOwnAccountWithPin(pin4) {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  if (!user?.email) throw new Error('로그인이 필요합니다.');
  if (isMasterAccountEmail(user.email)) {
    throw new Error('마스터 계정은 앱에서 삭제할 수 없습니다.');
  }
  const cred = EmailAuthProvider.credential(user.email, pinToFirebasePassword(pin4));
  await reauthenticateWithCredential(user, cred);
  const db = getFirestoreDb();
  if (db) {
    await deleteDoc(doc(db, USERS_COLLECTION, user.uid));
  }
  await deleteUser(user);
}

export function subscribeAuth(callback) {
  const auth = getFirebaseAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}
