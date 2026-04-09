import { mergeUserPurchasedPackKeys } from './userProfileService.js';
import { isPackInAppPurchasable } from '../config/packCatalog.js';

/**
 * 스토어 결제 완료 후 호출(검증된 구매만) — Firestore purchasedPackKeys 병합
 * @param {string} uid
 * @param {string} packId
 */
export async function applyVerifiedPurchaseToProfile(uid, packId) {
  if (!uid || !packId || !isPackInAppPurchasable(packId)) {
    throw new Error('유효하지 않은 팩 또는 로그인이 필요합니다.');
  }
  await mergeUserPurchasedPackKeys(uid, [packId]);
}

/**
 * 개발·내부 테스트용: 결제 없이 구매 해금 시뮬레이션 (프로덕션 빌드에서는 동작하지 않음)
 * @param {string} uid
 * @param {string} packId
 */
export async function devSimulatePurchase(uid, packId) {
  if (!import.meta.env.DEV) {
    throw new Error('개발 모드에서만 사용할 수 있습니다.');
  }
  await applyVerifiedPurchaseToProfile(uid, packId);
}
