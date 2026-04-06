import { safeGetItem, safeSetItem } from '../utils/safeStorage.js';

/** 브라우저별 플레이어 고유 ID (localStorage) */
const KEY = 'sisort_pid';

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
