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
  getDoc,
  getDocs,
  writeBatch,
} from 'firebase/firestore';

/** 동일 방 코드로 새 방을 만들 수 있도록 하는 문서 보존 기간(밀리초) — 이후에는 덮어쓰기 허용 */
export const ROOM_DOC_STALE_MS = 60 * 60 * 1000;

export const ROOM_MIN = 2;
/** 오프라인·로컬 로비에서 허용하는 최대 인원 */
export const ROOM_MAX = 15;
/** 온라인(Firestore) 방 최대 인원 — 성능·동기화 부담 완화 */
export const ONLINE_ROOM_MAX = 6;

/**
 * updatedAt 기준 오래된 방 문서인지 — 같은 roomId로 새 로비를 만들 수 있게 함
 */
function isRoomDocumentStale(data) {
  if (!data || typeof data !== 'object') return true;
  const u = data.updatedAt;
  if (!u || typeof u.toMillis !== 'function') return true;
  return Date.now() - u.toMillis() > ROOM_DOC_STALE_MS;
}

/**
 * 이전 세션의 actions 하위 문서 제거(같은 방 코드 재사용 시 남은 액션으로 인한 오동작 방지)
 */
async function deleteRoomActionsInBatches(db, roomId) {
  const cref = collection(db, 'rooms', roomId, 'actions');
  const snap = await getDocs(cref);
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 500) {
    const batch = writeBatch(db);
    const end = Math.min(i + 500, docs.length);
    for (let j = i; j < end; j += 1) {
      batch.delete(docs[j].ref);
    }
    await batch.commit();
  }
}

/**
 * 방 생성(로비) — 같은 roomId가 이미 있으면 오류.
 * 단, 문서가 ROOM_DOC_STALE_MS보다 오래됐으면 덮어써서 동일 코드로 새 방 생성 가능.
 * @param {import('firebase/firestore').Firestore} db
 */
/**
 * @param {{ hostId: string, packKey: string, members: unknown[], hostPackProgress?: Record<string, number>, hostPackUnlockBonus?: string[], hostIsMaster?: boolean }} payload
 */
export async function createRoomDoc(db, roomId, { hostId, packKey, members, hostPackProgress, hostPackUnlockBonus, hostIsMaster }) {
  const ref = doc(db, 'rooms', roomId);
  const pre = await getDoc(ref);
  if (pre.exists()) {
    const data = pre.data();
    if (!isRoomDocumentStale(data)) {
      throw new Error('ROOM_ALREADY_EXISTS');
    }
    await deleteRoomActionsInBatches(db, roomId);
  }
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (!isRoomDocumentStale(data)) {
        throw new Error('ROOM_ALREADY_EXISTS');
      }
    }
    transaction.set(ref, {
      hostId,
      packKey,
      hostPackProgress: hostPackProgress && typeof hostPackProgress === 'object' ? hostPackProgress : {},
      hostPackUnlockBonus: Array.isArray(hostPackUnlockBonus) ? hostPackUnlockBonus : [],
      /** 방장이 마스터면 참가자도 방장과 동일하게 모든 팩 선택 가능 */
      hostIsMaster: hostIsMaster === true,
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

/**
 * 방 문서 구독 — onData(room, metadata)
 * metadata.fromCache 가 true 인 오래된 로비 스냅샷은 진행 중 게임을 잘못 초기화할 수 있어 훅에서 필터링함
 */
export function subscribeRoom(db, roomId, onData) {
  const ref = doc(db, 'rooms', roomId);
  return onSnapshot(
    ref,
    (snap) => {
      const room = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      onData(room, snap.metadata);
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

/** 비호스트 → 호스트: 살펴보기 즉시 종료(오프라인과 동일하게 호스트 판만 진행) */
export async function pushSkipPrepAction(db, roomId) {
  await addDoc(collection(db, 'rooms', roomId, 'actions'), {
    type: 'SKIP_PREP',
    createdAt: serverTimestamp(),
  });
}

/** 비호스트 → 호스트: 테이블 확인(복습 전 대기) 즉시 종료 */
export async function pushFinishTableReviewAction(db, roomId) {
  await addDoc(collection(db, 'rooms', roomId, 'actions'), {
    type: 'FINISH_TABLE_REVIEW',
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
