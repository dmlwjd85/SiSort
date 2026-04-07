/**
 * 오프라인 단일 세션 진행 저장 (로컬스토리지)
 * 온라인 방 플레이와는 별개 — 호스트·게스트는 저장하지 않음
 */
export const OFFLINE_RUN_SAVE_KEY = 'sisort_offline_run_v1';

/**
 * @returns {{ v: number, packKey: string, nextLevel: number, usedWords: string[], lives: number, hints: number } | null}
 */
export function loadOfflineRunSave() {
  try {
    const raw = localStorage.getItem(OFFLINE_RUN_SAVE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (o?.v !== 1 || typeof o.packKey !== 'string') return null;
    return o;
  } catch {
    return null;
  }
}

export function clearOfflineRunSave() {
  try {
    localStorage.removeItem(OFFLINE_RUN_SAVE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * @param {{ packKey: string, nextLevel: number, usedWords: string[], lives: number, hints: number }} payload
 */
export function writeOfflineRunSave(payload) {
  try {
    localStorage.setItem(OFFLINE_RUN_SAVE_KEY, JSON.stringify({ v: 1, ...payload }));
  } catch (e) {
    console.error('[writeOfflineRunSave]', e);
  }
}
