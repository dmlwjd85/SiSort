/**
 * 단어팩 카탈로그 (단일 진입점)
 * --------------------------------
 * 새 팩을 넣을 때:
 * 1) src/data/words.js 의 PACK_DATA 에 팩 키·단어를 추가
 * 2) 이 파일에서 CHAIN에 넣거나(순차 무료 해금), IAP만 넣거나(유료 전용) 설정
 * 3) 스토어에 productIds 를 등록한 뒤 앱 결제 모듈에서 동일 문자열 사용
 *
 * 보안: 실제 결제 검증 후 서버(Cloud Functions 등)에서만 purchasedPackKeys 를 쓰는 것이 이상적입니다.
 * 현재는 클라이언트 병합 API가 있으므로, 운영 시 검증 엔드포인트와 연동하세요.
 */

import { PACK_DATA } from '../data/words.js';

/**
 * 순차 진행 해금 순서 (이전 팩 7레벨 클리어 시 다음 팩 오픈)
 * — PACK_DATA 에 없는 키는 런타임에서 무시됩니다.
 */
export const PACK_CHAIN_ORDER = [
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

/** 게스트에게만 허용되는 팩 키 */
export const GUEST_PACK_IDS = ['kindergarten', 'grade6social'].filter((k) => PACK_DATA[k]);

/**
 * 인앱 결제로 해금 가능한 팩
 * - earlyAccess: true → 체인으로도 나중에 무료 해금 가능, 결제 시 즉시 해금
 * - earlyAccess: false → 체인에 넣지 않은 «유료 전용» 팩용 (CHAIN에 넣지 마세요)
 *
 * productIds 는 Play Console / App Store Connect 인앱 상품 ID 와 동일하게 맞춥니다.
 */
export const PACK_IAP_BY_PACK_ID = {
  sajaseongeo_advanced: {
    earlyAccess: true,
    productIds: {
      android: 'sisort_pack_sajaseongeo_advanced',
      ios: 'sisort.pack.sajaseongeo.advanced',
    },
    priceLabel: '유료',
  },
  korean_history_early: {
    earlyAccess: true,
    productIds: {
      android: 'sisort_pack_korean_history_early',
      ios: 'sisort.pack.korean_history_early',
    },
    priceLabel: '유료',
  },
};

const IAP_PACK_IDS = Object.keys(PACK_IAP_BY_PACK_ID);

/** 마스터·관리 화면용: 플레이 가능한 전체 팩 키(체인 + 유료 전용 등록분) */
export function getAllRegisteredPackIds() {
  const s = new Set(PACK_CHAIN_ORDER);
  for (const k of IAP_PACK_IDS) {
    if (PACK_DATA[k]) s.add(k);
  }
  return [...s];
}

/** 인앱으로 등록된 팩인지 */
export function isPackInAppPurchasable(packId) {
  return Boolean(PACK_DATA[packId] && PACK_IAP_BY_PACK_ID[packId]);
}

/** earlyAccess 가 아닌 유료 전용(체인 비포함) */
export function isPurchaseOnlyPack(packId) {
  const c = PACK_IAP_BY_PACK_ID[packId];
  return Boolean(c && !c.earlyAccess);
}

/** 서버/클라이언트에서 저장 전 화이트리스트 필터 */
export function filterValidPurchasedPackKeys(keys) {
  const allowed = new Set(IAP_PACK_IDS.filter((k) => PACK_DATA[k]));
  return [...new Set((Array.isArray(keys) ? keys : []).filter((k) => typeof k === 'string' && allowed.has(k)))];
}

/**
 * @param {string} packId
 * @param {'android'|'ios'} platform
 * @returns {string|null}
 */
export function getStoreProductId(packId, platform) {
  const entry = PACK_IAP_BY_PACK_ID[packId];
  if (!entry?.productIds) return null;
  return entry.productIds[platform] || null;
}
