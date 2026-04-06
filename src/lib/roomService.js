import {
  doc,
  setDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
} from 'firebase/firestore';

export const ROOM_MIN = 2;
export const ROOM_MAX = 15;

/**
 * 방 생성(로비)
 * @param {import('firebase/firestore').Firestore} db
 */
export async function createRoomDoc(db, roomId, { hostId, packKey, members }) {
  await setDoc(
    doc(db, 'rooms', roomId),
    {
      hostId,
      packKey,
      phase: 'lobby',
      members,
      game: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * 방 참가: 멤버에 본인이 없으면 추가 (총 인원 15 이하)
 */
export async function joinRoomDoc(db, roomId, member) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) {
      throw new Error('ROOM_NOT_FOUND');
    }
    const data = snap.data();
    if (data.phase !== 'lobby') {
      throw new Error('GAME_ALREADY_STARTED');
    }
    let members = Array.isArray(data.members) ? [...data.members] : [];
    if (members.some((m) => m.playerId === member.playerId)) {
      return;
    }
    if (members.length >= ROOM_MAX) {
      throw new Error('ROOM_FULL');
    }
    members.push(member);
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/** 호스트가 멤버 목록 전체 교체(로비에서 AI 추가/삭제) */
export async function updateRoomMembers(db, roomId, members, hostId) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    if (data.hostId !== hostId) throw new Error('NOT_HOST');
    if (data.phase !== 'lobby') throw new Error('NOT_LOBBY');
    if (!Array.isArray(members) || members.length < ROOM_MIN || members.length > ROOM_MAX) {
      throw new Error('BAD_MEMBER_COUNT');
    }
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/** 게임 시작(호스트): 페이즈·초기 game 페이로드 */
export async function startRoomGame(db, roomId, hostId, gamePayload) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    if (data.hostId !== hostId) throw new Error('NOT_HOST');
    transaction.update(ref, {
      phase: 'playing',
      game: gamePayload,
      updatedAt: serverTimestamp(),
    });
  });
}

/** 호스트가 진행 중 게임 상태 갱신 */
export async function updateRoomGame(db, roomId, hostId, game) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.hostId !== hostId) return;
    if (data.phase !== 'playing') return;
    transaction.update(ref, { game, updatedAt: serverTimestamp() });
  });
}

export function subscribeRoom(db, roomId, onData) {
  const ref = doc(db, 'rooms', roomId);
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (err) => console.error('subscribeRoom', err)
  );
}

/** 비호스트 → 호스트로 플레이 의도 전달 */
export async function pushPlayAction(db, roomId, { cardId, slot }) {
  await addDoc(collection(db, 'rooms', roomId, 'actions'), {
    type: 'PLAY_CARD',
    cardId,
    slot,
    createdAt: serverTimestamp(),
  });
}

export function subscribeActions(db, roomId, onAdded) {
  const q = query(collection(db, 'rooms', roomId, 'actions'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'added') {
        onAdded(ch.doc.id, ch.doc.data());
      }
    });
  });
}

export async function deleteActionDoc(db, roomId, actionDocId) {
  await deleteDoc(doc(db, 'rooms', roomId, 'actions', actionDocId));
}
