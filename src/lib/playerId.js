/** 브라우저별 플레이어 고유 ID (localStorage) */
const KEY = 'sisort_pid';

export function getOrCreatePlayerId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `p-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `guest-${Date.now()}`;
  }
}
