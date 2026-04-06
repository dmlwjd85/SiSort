import { PACK_DATA } from '../data/words.js';

/**
 * 팩 잠금 해제 순서 (이전 팩에서 8레벨 클리어 시 다음 팩 오픈)
 * PACK_DATA에 없는 키는 제외
 */
export const PACK_UNLOCK_ORDER = [
  'kindergarten',
  'grade1',
  'grade2',
  'grade3',
  'grade4',
  'grade5',
  'grade6',
  'grade6social',
  'sajaseongeo_beginner',
  'sajaseongeo_intermediate',
  'sajaseongeo_advanced',
].filter((k) => PACK_DATA[k]);

const UNLOCK_THRESHOLD = 8;

/**
 * @param {{ isGuest: boolean, packProgress?: Record<string, number> }} opts
 * @returns {Set<string>} 플레이 가능한 팩 키
 */
export function getUnlockedPackKeys({ isGuest, packProgress = {} }) {
  if (isGuest) {
    return new Set(['kindergarten', 'grade6social'].filter((k) => PACK_DATA[k]));
  }

  const unlocked = new Set();
  for (let i = 0; i < PACK_UNLOCK_ORDER.length; i++) {
    const key = PACK_UNLOCK_ORDER[i];
    if (!PACK_DATA[key]) continue;
    if (i === 0) {
      unlocked.add(key);
      continue;
    }
    const prevKey = PACK_UNLOCK_ORDER[i - 1];
    const prevMax = Number(packProgress[prevKey]) || 0;
    if (prevMax >= UNLOCK_THRESHOLD) {
      unlocked.add(key);
    }
  }
  return unlocked;
}

/** 팩이 잠금인지 (회원 기준) */
export function isPackLocked(packKey, { isGuest, packProgress }) {
  return !getUnlockedPackKeys({ isGuest, packProgress }).has(packKey);
}
