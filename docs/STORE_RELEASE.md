# 플레이스토어·앱스토어 출시 가이드 (Sisort)

본 문서는 Capacitor로 감싼 웹앱을 Android·iOS 스토어에 올릴 때의 체크리스트입니다.

## 1. 식별자 변경 (필수)

`capacitor.config.json`의 `appId`가 현재 `app.sisort.game`입니다. **본인 도메인 역순**으로 고유한 ID로 바꾼 뒤:

```bash
npm run cap:sync
```

Android `applicationId`·iOS `PRODUCT_BUNDLE_IDENTIFIER`는 동기화로 맞춰집니다. 이미 스토어에 올린 뒤에는 변경하지 마세요.

## 2. 웹 빌드 → 네이티브 동기화

GitHub Pages용 `/SiSort/` base와 달리, **스토어용은 반드시** 아래만 사용합니다.

```bash
npm run cap:sync
```

내부적으로 `CAPACITOR=true`로 Vite `base`가 `/`가 됩니다.

## 3. Android (Play Console)

1. [Firebase Console](https://console.firebase.google.com)에서 Android 앱을 등록하고 `google-services.json`을 받아 `android/app/`에 둡니다(없으면 FCM 등은 비활성).
2. Android Studio에서 `android` 폴더를 열고 **Release 서명** 설정(업로드 키).
3. **앱 번들(AAB)** 빌드 후 Play Console에 업로드.
4. **데이터 안전(Data safety)**: Firebase(인증·Firestore)·기기 ID·진행도 등을 `public/legal/privacy.html`과 일치하게 기재.
5. **개인정보처리방침 URL**: 배포된 사이트 또는 호스팅된 `privacy.html` 전체 URL을 등록. 앱 내 «개인정보처리방침» 링크와 동일한 내용 권장.

`versionCode` / `versionName`은 `android/app/build.gradle`의 `defaultConfig`에서 매 출시마다 올립니다.

## 4. iOS (App Store Connect)

1. macOS에서 Xcode로 `ios/App/App.xcworkspace`를 엽니다(처음이면 터미널에서 `cd ios/App && pod install`).
2. **Signing & Capabilities**에서 팀·번들 ID 설정.
3. **App Privacy** 질문지: Firebase·진행도·표시 이름 등 수집 항목을 정직하게 선택.
4. **계정 삭제**: 앱 로비 «계정 삭제»로 본인 Firestore 문서·Firebase Auth 삭제 가능. 심사 시 해당 경로를 설명에 적습니다.
5. `ITSAppUsesNonExemptEncryption`를 `Info.plist`에 `false`로 두었습니다(HTTPS만 사용 시 일반적). 실제 암호화 사용이 다르면 법무 검토 후 수정하세요.

`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`은 Xcode 타깃 설정에서 관리합니다.

## 5. Firestore 보안 규칙

저장소의 `firestore.rules`에 **본인 `users/{uid}` 삭제** 허용이 포함되어 있습니다. Firebase 콘솔에 **반드시 배포**해야 앱 내 계정 삭제가 성공합니다.

## 6. 법적 문서

- `public/legal/privacy.html` — 개인정보처리방침  
- `public/legal/terms.html` — 이용약관  

스토어에 제출하는 URL은 위 파일과 **동일한 내용**이어야 합니다. 연락처 이메일은 스토어에 등록한 개발자 연락처와 맞추세요.

## 7. 자주 빠지는 항목

- 스크린샷(폰·태블릿 규격), 연령 등급, 콘텐츠 설명(온라인 기능·Firebase 필요 여부).
- 앱이 거부되는 경우: 로그인 없이 동작하는지, 개인정보 링크 깨짐, 계정 삭제 불가 등.
