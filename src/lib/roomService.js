import {
  doc,
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
/** 오프라인·로컬 로비에서 허용하는 최대 인원 */
export const ROOM_MAX = 15;
/** 온라인(Firestore) 방 최대 인원 — 성능·동기화 부담 완화 */
export const ONLINE_ROOM_MAX = 4;

/**
 * 방 생성(로비) — 같은 roomId 문서가 이미 있으면 생성하지 않음(merge로 기존 방 덮어쓰기 방지)
 * @param {import('firebase/firestore').Firestore} db
 */
/**
 * @param {{ hostId: string, packKey: string, members: unknown[], hostPackProgress?: Record<string, number> }} payload
 */
export async function createRoomDoc(db, roomId, { hostId, packKey, members, hostPackProgress }) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists()) {
      throw new Error('ROOM_ALREADY_EXISTS');
    }
    transaction.set(ref, {
      hostId,
      packKey,
      hostPackProgress: hostPackProgress && typeof hostPackProgress === 'object' ? hostPackProgress : {},
      phase: 'lobby',
      members,
      game: null,
      updatedAt: serverTimestamp(),
    });
  });
}

/**
 * 방 참가: 멤버에 본인이 없으면 추가 (온라인은 ONLINE_ROOM_MAX 이하)
 * 꽉 찼을 때 가상 플레이어(AI) 슬롯이 있으면 그 자리를 참가자로 교체
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
    if (members.some((m) => m && m.playerId === member.playerId)) {
      return;
    }
    if (members.length >= ONLINE_ROOM_MAX) {
      const aiIdx = members.findIndex((m) => m && m.isAI === true);
      if (aiIdx >= 0) {
        members[aiIdx] = { ...member, isAI: false };
        transaction.update(ref, { members, updatedAt: serverTimestamp() });
        return;
      }
      throw new Error('ROOM_FULL');
    }
    members.push(member);
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/**
 * 본인 퇴장: 슬롯 인덱스를 유지하기 위해 같은 위치를 AI로 교체 (로비·플레이 중 공통)
 * 마지막 실제 플레이어 1명이 나가면 방을 로비로 비우지 않고 phase만 로비·game 제거(재시작 대기)
 */
export async function playerSelfLeaveRoom(db, roomId, leavingPlayerId) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    const members = Array.isArray(data.members) ? [...data.members] : [];
    const idx = members.findIndex((m) => m && String(m.playerId) === String(leavingPlayerId));
    if (idx < 0) return;

    if (String(data.hostId) === String(leavingPlayerId)) {
      throw new Error('HOST_USE_RETURN_LOBBY');
    }

    const humans = members.filter((m) => m && !m.isAI);
    if (humans.length <= 1 && !members[idx].isAI) {
      transaction.update(ref, {
        phase: 'lobby',
        game: null,
        members: [],
        updatedAt: serverTimestamp(),
      });
      return;
    }

    members[idx] = {
      playerId: `ai-replace-${Date.now()}`,
      name: 'AI (대체)',
      isAI: true,
    };
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/**
 * 호스트: 플레이 종료 후 방을 다시 로비로 (같은 멤버로 재시작 가능)
 */
export async function returnRoomToLobby(db, roomId, hostId) {
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    if (String(data.hostId) !== String(hostId)) throw new Error('NOT_HOST');
    transaction.update(ref, {
      phase: 'lobby',
      game: null,
      updatedAt: serverTimestamp(),
    });
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
    if (!Array.isArray(members) || members.length < ROOM_MIN || members.length > ONLINE_ROOM_MAX) {
      throw new Error('BAD_MEMBER_COUNT');
    }
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/**
 * 로비에서 호스트가 특정 참가자 추방 (본인·호스트는 추방 불가)
 */
export async function kickMemberFromRoom(db, roomId, hostId, targetPlayerId) {
  if (!targetPlayerId || targetPlayerId === hostId) {
    throw new Error('INVALID_KICK_TARGET');
  }
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    if (data.hostId !== hostId) throw new Error('NOT_HOST');
    if (data.phase !== 'lobby') throw new Error('NOT_LOBBY');
    const members = (Array.isArray(data.members) ? data.members : []).filter(
      (m) => m && m.playerId !== targetPlayerId
    );
    if (members.length < ROOM_MIN) throw new Error('BAD_MEMBER_COUNT');
    transaction.update(ref, { members, updatedAt: serverTimestamp() });
  });
}

/**
 * 로비에서 본인 표시 이름 변경 (Firestore 멤버 배열의 name 갱신)
 */
export async function updatePlayerNameInRoom(db, roomId, playerId, newName) {
  const trimmed = typeof newName === 'string' ? newName.trim() : '';
  if (!trimmed) throw new Error('EMPTY_NAME');
  const ref = doc(db, 'rooms', roomId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists()) throw new Error('ROOM_NOT_FOUND');
    const data = snap.data();
    if (data.phase !== 'lobby') throw new Error('NOT_LOBBY');
    const prev = Array.isArray(data.members) ? data.members : [];
    if (!prev.some((m) => m && m.playerId === playerId)) throw new Error('NOT_IN_ROOM');
    const members = prev.map((m) =>
      m && m.playerId === playerId ? { ...m, name: trimmed } : m
    );
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

/** 비호스트 → 호스트: 살펴보기 시간 중 손패 순서만 변경 */
/** 비호스트 → 호스트: 손패 순서 변경(살펴보기·대기 중 등) */
export async function pushPrepReorderAction(db, roomId, { slot, order }) {
  await addDoc(collection(db, 'rooms', roomId, 'actions'), {
    type: 'REORDER_PREP',
    slot,
    order,
    createdAt: serverTimestamp(),
  });
}

/** 비호스트 → 호스트: 길라잡이 모드 켜기/끄기 */
export async function pushHintToggleAction(db, roomId, { slot, turnOn, playerName }) {
  await addDoc(collection(db, 'rooms', roomId, 'actions'), {
    type: 'HINT_TOGGLE',
    slot,
    turnOn: Boolean(turnOn),
    playerName: typeof playerName === 'string' ? playerName : '',
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
