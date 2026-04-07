import { PACK_DATA } from '../data/words.js';

/**
 * 팩 잠금 해제 순서 (이전 팩에서 7레벨 클리어 시 다음 팩 오픈)
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
  'korean_history_early',
].filter((k) => PACK_DATA[k]);

const UNLOCK_THRESHOLD = 7;

/**
 * @param {{ isGuest: boolean, packProgress?: Record<string, number>, packUnlockBonus?: string[], isMaster?: boolean }} opts
 * packUnlockBonus: 마스터·관리자가 users 문서에 부여한 추가 플레이 가능 팩(진행 체인과 무관)
 * isMaster: 마스터·전역 관리 계정 — 진행도와 무관하게 등록된 모든 단어 팩 플레이 허용
 * @returns {Set<string>} 플레이 가능한 팩 키
 */
export function getUnlockedPackKeys({
  isGuest,
  packProgress = {},
  packUnlockBonus = [],
  isMaster = false,
}) {
  if (isGuest) {
    return new Set(['kindergarten', 'grade6social'].filter((k) => PACK_DATA[k]));
  }

  /* 회원 중 마스터는 체인 클리어 없이 PACK_DATA에 있는 팩 전부 선택 가능 */
  if (isMaster) {
    return new Set(PACK_UNLOCK_ORDER.filter((k) => PACK_DATA[k]));
  }

  const bonus = new Set(
    (Array.isArray(packUnlockBonus) ? packUnlockBonus : []).filter((k) => k && PACK_DATA[k])
  );

  const unlocked = new Set();
  for (let i = 0; i < PACK_UNLOCK_ORDER.length; i++) {
    const key = PACK_UNLOCK_ORDER[i];
    if (!PACK_DATA[key]) continue;
    if (bonus.has(key)) {
      unlocked.add(key);
      continue;
    }
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
  for (const k of bonus) {
    if (PACK_DATA[k]) unlocked.add(k);
  }
  return unlocked;
}

/** 팩이 잠금인지 (회원 기준) */
export function isPackLocked(packKey, { isGuest, packProgress, packUnlockBonus, isMaster = false }) {
  return !getUnlockedPackKeys({ isGuest, packProgress, packUnlockBonus, isMaster }).has(packKey);
}

/**
 * 현재 팩 키의 다음 팩 키 (없으면 null)
 * @param {string} currentPackKey
 * @returns {string|null}
 */
export function getNextPackKey(currentPackKey) {
  const i = PACK_UNLOCK_ORDER.indexOf(currentPackKey);
  if (i < 0 || i >= PACK_UNLOCK_ORDER.length - 1) return null;
  const next = PACK_UNLOCK_ORDER[i + 1];
  return PACK_DATA[next] ? next : null;
}
