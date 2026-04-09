import { PACK_DATA } from '../data/words.js';
import {
  PACK_CHAIN_ORDER,
  GUEST_PACK_IDS,
  filterValidPurchasedPackKeys,
  getAllRegisteredPackIds,
} from '../config/packCatalog.js';

/** 로비·명예의 전당 등 기존 코드 호환용 별칭 */
export const PACK_UNLOCK_ORDER = PACK_CHAIN_ORDER;

const UNLOCK_THRESHOLD = 7;

/**
 * @param {{ isGuest: boolean, packProgress?: Record<string, number>, packUnlockBonus?: string[], purchasedPackKeys?: string[], isMaster?: boolean }} opts
 * packUnlockBonus: 마스터·관리자가 부여한 추가 해금
 * purchasedPackKeys: 인앱 결제 등으로 해금된 팩(서버 검증 후 저장 권장)
 */
export function getUnlockedPackKeys({
  isGuest,
  packProgress = {},
  packUnlockBonus = [],
  purchasedPackKeys = [],
  isMaster = false,
}) {
  if (isGuest) {
    return new Set(GUEST_PACK_IDS.filter((k) => PACK_DATA[k]));
  }

  if (isMaster) {
    return new Set(getAllRegisteredPackIds().filter((k) => PACK_DATA[k]));
  }

  const bonus = new Set(
    (Array.isArray(packUnlockBonus) ? packUnlockBonus : []).filter((k) => k && PACK_DATA[k])
  );

  const purchased = new Set(filterValidPurchasedPackKeys(purchasedPackKeys));

  const unlocked = new Set();
  for (let i = 0; i < PACK_CHAIN_ORDER.length; i++) {
    const key = PACK_CHAIN_ORDER[i];
    if (!PACK_DATA[key]) continue;
    if (bonus.has(key)) {
      unlocked.add(key);
      continue;
    }
    if (purchased.has(key)) {
      unlocked.add(key);
      continue;
    }
    if (i === 0) {
      unlocked.add(key);
      continue;
    }
    const prevKey = PACK_CHAIN_ORDER[i - 1];
    const prevMax = Number(packProgress[prevKey]) || 0;
    if (prevMax >= UNLOCK_THRESHOLD) {
      unlocked.add(key);
    }
  }
  for (const k of bonus) {
    if (PACK_DATA[k]) unlocked.add(k);
  }
  for (const k of purchased) {
    if (PACK_DATA[k]) unlocked.add(k);
  }
  return unlocked;
}

/** 팩이 잠금인지 (회원 기준) */
export function isPackLocked(
  packKey,
  { isGuest, packProgress, packUnlockBonus, purchasedPackKeys = [], isMaster = false }
) {
  return !getUnlockedPackKeys({
    isGuest,
    packProgress,
    packUnlockBonus,
    purchasedPackKeys,
    isMaster,
  }).has(packKey);
}

/**
 * 현재 팩 키의 다음 팩 키 (없으면 null)
 * @param {string} currentPackKey
 * @returns {string|null}
 */
export function getNextPackKey(currentPackKey) {
  const i = PACK_CHAIN_ORDER.indexOf(currentPackKey);
  if (i < 0 || i >= PACK_CHAIN_ORDER.length - 1) return null;
  const next = PACK_CHAIN_ORDER[i + 1];
  return PACK_DATA[next] ? next : null;
}
