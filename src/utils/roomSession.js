/**
 * 온라인 방 코드 세션 캐시 — 1시간 후 자동 무효(오래된 방 자동 재입장 방지)
 */
const KEY_META = 'sisort_room_meta';
const KEY_LEGACY = 'sisort_room_id';
const MAX_MS = 60 * 60 * 1000;

/** sessionStorage에서 유효한 방 ID만 읽기(만료·legacy 마이그레이션) */
export function readRoomIdFromSession() {
  try {
    const raw = sessionStorage.getItem(KEY_META);
    if (raw) {
      const o = JSON.parse(raw);
      const id = typeof o?.id === 'string' ? o.id : null;
      const at = Number(o?.at);
      if (id && Number.isFinite(at) && Date.now() - at <= MAX_MS) return id;
      sessionStorage.removeItem(KEY_META);
      return null;
    }
    const legacy = sessionStorage.getItem(KEY_LEGACY);
    if (legacy) {
      sessionStorage.removeItem(KEY_LEGACY);
      sessionStorage.setItem(KEY_META, JSON.stringify({ id: legacy, at: Date.now() }));
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** 방 ID 저장 시 같은 방이면 최초 시각 유지, 다른 방이면 시각 갱신 */
export function persistRoomSession(roomId) {
  try {
    if (!roomId) {
      sessionStorage.removeItem(KEY_META);
      sessionStorage.removeItem(KEY_LEGACY);
      return;
    }
    let at = Date.now();
    const raw = sessionStorage.getItem(KEY_META);
    if (raw) {
      try {
        const o = JSON.parse(raw);
        if (o?.id === roomId && Number.isFinite(Number(o?.at))) at = Number(o.at);
      } catch {
        /* ignore */
      }
    }
    sessionStorage.setItem(KEY_META, JSON.stringify({ id: roomId, at }));
    sessionStorage.removeItem(KEY_LEGACY);
  } catch {
    /* ignore */
  }
}

export function clearRoomSession() {
  try {
    sessionStorage.removeItem(KEY_META);
    sessionStorage.removeItem(KEY_LEGACY);
  } catch {
    /* ignore */
  }
}
