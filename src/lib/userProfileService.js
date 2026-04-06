import {
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  serverTimestamp,
  runTransaction,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { getFirestoreDb } from './firebase.js';

const USERS = 'users';
const ADMINS = 'admins';
const HALL_OF_FAME = 'hallOfFame';
const ACCESS_LOG_MAX = 30;

/**
 * 회원 문서 최초 생성(회원가입 직후)
 * @param {string} uid
 * @param {{ email: string, birthDate: string, displayName: string }} p — displayName은 보통 이메일 @ 앞(표시용)
 */
export async function createUserProfile(uid, { email, birthDate, displayName }) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore 없음');
  const ref = doc(db, USERS, uid);
  await setDoc(
    ref,
    {
      email: email.trim(),
      birthDate: String(birthDate).trim(),
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
 * 오프라인 1:1 AI 조건으로 레벨 클리어 시 통계 누적(본인 기록·관리자 열람)
 */
export async function recordEligibleLevelClear(uid, packKey, level) {
  const db = getFirestoreDb();
  if (!db || !uid) return;
  const ref = doc(db, USERS, uid);
  await updateDoc(ref, {
    'playStats.eligibleLevelClears': increment(1),
    'playStats.lastPackKey': packKey,
    'playStats.lastLevel': Number(level) || 0,
    'playStats.lastClearAt': serverTimestamp(),
  });
}

/**
 * @returns {Promise<import('firebase/firestore').DocumentData|null>}
 */
export async function fetchUserDocument(uid) {
  const db = getFirestoreDb();
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, USERS, uid));
  if (!snap.exists()) return null;
  return snap.data();
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

/**
 * 팩별 최고 레벨 달성 시 명예의 전당 갱신(동점이면 먼저 도달한 기록 유지)
 * @param {string} uid
 * @param {string} packKey
 * @param {number} clearedLevel
 * @param {string} holderName 로비 표시 이름
 */
export async function tryUpdateHallOfFame(uid, packKey, clearedLevel, holderName) {
  const db = getFirestoreDb();
  if (!db || !uid || !packKey) return;
  const n = Number(clearedLevel);
  if (!Number.isFinite(n) || n < 1) return;

  const userRef = doc(db, USERS, uid);
  const hallRef = doc(db, HALL_OF_FAME, packKey);
  const safeName = String(holderName || '').trim().slice(0, 48) || '익명';

  await runTransaction(db, async (transaction) => {
    const userSnap = await transaction.get(userRef);
    const userProgress = userSnap.exists() ? userSnap.data().packProgress || {} : {};
    const recorded = Number(userProgress[packKey]) || 0;
    // 진행도가 아직 반영되지 않았으면 갱신하지 않음(보안 규칙과 일치)
    if (recorded < n) return;

    const hallSnap = await transaction.get(hallRef);
    const prev = hallSnap.exists() ? hallSnap.data() : {};
    const prevMax = Number(prev.maxLevel) || 0;
    const prevHolder = prev.holderUid;

    if (n < prevMax) return;
    if (n === prevMax && prevHolder && prevHolder !== uid) return;

    transaction.set(
      hallRef,
      {
        maxLevel: n,
        holderUid: uid,
        holderName: safeName,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
