# 단어팩 추가·유료 해금 가이드

## 파일 역할

| 파일 | 설명 |
|------|------|
| `src/data/words.js` | `PACK_DATA` — 팩 키, 표시 이름, 단어 배열 |
| `src/config/packCatalog.js` | **단일 설정** — 순차 해금 순서(`PACK_CHAIN_ORDER`), 게스트 허용 팩, 인앱 상품(`PACK_IAP_BY_PACK_ID`) |

## 새 무료(순차) 팩 넣기

1. `src/data/` 에 단어 모듈을 만들거나 `words.js`에 직접 `parsePack([...])` 로 항목 추가.
2. `PACK_DATA` 에 고유 키(영문 스네이크 케이스)로 등록.
3. `src/config/packCatalog.js` 의 `PACK_CHAIN_ORDER` 배열에 **원하는 순서 위치**로 키를 넣는다.
4. 빌드 후 플레이로 잠금 해금이 기대대로 되는지 확인.

## 유료(인앱) 팩

1. 위와 같이 `PACK_DATA` 에 팩을 만든다.
2. `packCatalog.js` 의 `PACK_IAP_BY_PACK_ID` 에 동일 키로 항목 추가:
   - `earlyAccess: true` — 순차 진행으로도 나중에 무료 해금 가능, **구매 시 즉시 해금**.
   - `earlyAccess: false` — **유료 전용**: `PACK_CHAIN_ORDER` 에 넣지 않는다.
3. `productIds.android` / `productIds.ios` 는 각 스토어 인앱 상품 ID 와 **정확히 동일**하게 맞춘다.
4. 운영 시에는 Play/App 영수증 검증 후 **Cloud Functions 등에서** `mergeUserPurchasedPackKeys(uid, [packKey])` 를 호출하는 방식을 권장한다.  
   개발 모드에서는 로비 «개발: 구매 해금 시뮬레이션»으로 Firestore `purchasedPackKeys` 만 테스트할 수 있다.

## Firestore

- 사용자 문서 필드: `purchasedPackKeys` (문자열 배열, 카탈로그에 등록된 IAP 팩만 유효).
- 온라인 방: 방장의 구매 목록이 `hostPurchasedPackKeys` 로 동기화된다.

## 배포

GitHub Pages: `main`/`master` 푸시 시 `.github/workflows/deploy-pages.yml` 이 자동 빌드·배포한다.
