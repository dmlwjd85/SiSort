/**
 * Firebase 웹 앱 공개 설정 (클라이언트용 · 보안은 Firestore 규칙으로)
 * VITE_FIREBASE_* 환경변수가 있으면 그쪽이 우선합니다.
 * 로컬/배포 시에는 루트의 다른 저장소(예: All-in-One-Home) .env 의 동일 키를 복사하거나,
 * 이 fallback 을 동일 프로젝트 값으로 맞추세요.
 */
export const firebasePublicConfig = {
  apiKey: 'AIzaSyAsih-sfnIZ_gX_1l7SAVZHCAhk3KzmiP8',
  authDomain: 'sambong-world-2026.firebaseapp.com',
  projectId: 'sambong-world-2026',
  storageBucket: 'sambong-world-2026.firebasestorage.app',
  messagingSenderId: '728320769100',
  appId: '1:728320769100:web:7510c9a77cca6b87a788e9',
};
