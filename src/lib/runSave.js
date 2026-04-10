import { safeGetItem, safeRemoveItem, safeSetItem } from '../utils/safeStorage.js';

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
    const raw = safeGetItem(OFFLINE_RUN_SAVE_KEY, null);
    if (raw == null || raw === '') return null;
    const o = JSON.parse(raw);
    if (o?.v !== 1 || typeof o.packKey !== 'string') return null;
    return o;
  } catch {
    return null;
  }
}

export function clearOfflineRunSave() {
  safeRemoveItem(OFFLINE_RUN_SAVE_KEY);
}

/**
 * @param {{ packKey: string, nextLevel: number, usedWords: string[], lives: number, hints: number }} payload
 * @returns {boolean} 저장 성공 여부
 */
export function writeOfflineRunSave(payload) {
  try {
    const json = JSON.stringify({ v: 1, ...payload });
    return safeSetItem(OFFLINE_RUN_SAVE_KEY, json);
  } catch (e) {
    console.error('[writeOfflineRunSave]', e);
    return false;
  }
}
