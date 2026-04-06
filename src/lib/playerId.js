import { safeGetItem, safeSetItem } from '../utils/safeStorage.js';

/** 브라우저별 플레이어 고유 ID (localStorage) */
const KEY = 'sisort_pid';

/** 로그인 시 Firebase uid로 동기화 (온라인 방·프로필과 일치) */
export function setPlayerIdFromAuth(uid) {
  if (uid) safeSetItem(KEY, uid);
}

/** 로그아웃 후 새 로컬 ID를 쓰고 싶을 때 */
export function clearPlayerId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getOrCreatePlayerId() {
  let id = safeGetItem(KEY, '');
  if (!id) {
    id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    if (!safeSetItem(KEY, id)) {
      return `guest-${Date.now()}`;
    }
  }
  return id;
}
