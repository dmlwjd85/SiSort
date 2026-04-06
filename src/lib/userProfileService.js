import { doc, setDoc, getDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { getFirestoreDb } from './firebase.js';

const USERS = 'users';
const ADMINS = 'admins';
const ACCESS_LOG_MAX = 30;

/**
 * 회원 문서 최초 생성(회원가입 직후)
 * @param {string} uid
 * @param {{ email: string, displayName: string }} p
 */
export async function createUserProfile(uid, { email, displayName }) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore 없음');
  const ref = doc(db, USERS, uid);
  await setDoc(
    ref,
    {
      email: email.trim(),
      displayName: displayName.trim(),
      packProgress: {},
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      accessCount: 1,
      accessHistory: [{ at: new Date().toISOString() }],
    },
    { merge: true }
  );
}

/**
 * 로그인 시 접속 기록·마지막 로그인 갱신
 */
export async function recordUserAccess(uid) {
  const db = getFirestoreDb();
  if (!db) return;
  const ref = doc(db, USERS, uid);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data() : {};
  const count = (prev.accessCount || 0) + 1;
  const history = Array.isArray(prev.accessHistory) ? [...prev.accessHistory] : [];
  history.push({ at: new Date().toISOString() });
  while (history.length > ACCESS_LOG_MAX) history.shift();

  await setDoc(
    ref,
    {
      lastLoginAt: serverTimestamp(),
      accessCount: count,
      accessHistory: history,
    },
    { merge: true }
  );
}

/**
 * 팩별 최대 클리어 레벨 갱신 (큰 값 유지)
 */
export async function updatePackProgressRemote(uid, packKey, clearedLevel) {
  const db = getFirestoreDb();
  if (!db) return;
  const ref = doc(db, USERS, uid);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? snap.data().packProgress || {} : {};
  const n = Math.max(Number(prev[packKey]) || 0, Number(clearedLevel) || 0);
  await setDoc(
    ref,
    {
      packProgress: { ...prev, [packKey]: n },
      lastProgressAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * @returns {Promise<Record<string, number>|null>}
 */
export async function fetchUserPackProgress(uid) {
  const db = getFirestoreDb();
  if (!db) return null;
  const snap = await getDoc(doc(db, USERS, uid));
  if (!snap.exists()) return {};
  const d = snap.data();
  return typeof d.packProgress === 'object' && d.packProgress ? d.packProgress : {};
}

/**
 * 관리자 목록: 관리자 문서가 있거나 환경변수 이메일 목록
 */
export async function checkIsAdminUser(user) {
  if (!user?.uid) return false;
  const env = import.meta.env.VITE_ADMIN_EMAILS || '';
  const emails = env
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (user.email && emails.includes(user.email.toLowerCase())) return true;

  const db = getFirestoreDb();
  if (!db) return false;
  const snap = await getDoc(doc(db, ADMINS, user.uid));
  return snap.exists();
}

/**
 * 관리자용: 전체 사용자 목록 (Firestore 규칙에서 관리자만 list 허용 필요)
 */
export async function fetchAllUserProfiles() {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore 없음');
  const snap = await getDocs(collection(db, USERS));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
