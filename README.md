# Sisort (침묵의 가나다)

Vite + React 앱입니다.

## 왜 Go Live로 열면 흰 화면만 보이나요?

**Live Server(Go Live)** 는 `index.html`만 정적 파일로 열고, **JSX·Vite 번들을 처리하지 않습니다.**  
그래서 `/src/main.jsx` 가 실행되지 않아 `#root`가 비어 흰 화면이 됩니다.

### 올바른 실행 방법

1. 이 폴더(`sisort`)를 연 상태에서 터미널을 엽니다.
2. 한 번만: `npm install`
3. 개발 서버: **`npm run dev`**
4. 브라우저에서 표시되는 주소(보통 `http://localhost:5173`)로 접속합니다.

빌드 결과만 확인할 때: `npm run build` 후 `npm run preview`

## GitHub Pages 배포

GitHub 저장소 **`dmlwjd85/SiSort`** 기준 배포 URL은 다음과 같습니다 (대소문자는 GitHub 표기에 맞춤).

`https://dmlwjd85.github.io/SiSort/`

1. GitHub에서 저장소 `dmlwjd85/SiSort` 가 있습니다 (원격은 아래와 같이 연결).
2. 이 `sisort` 폴더를 저장소 루트로 푸시합니다.
3. 저장소 **Settings → Pages → Build and deployment** 에서 **GitHub Actions** 를 소스로 선택합니다.
4. `main` 또는 `master` 에 푸시하면 `.github/workflows/deploy-pages.yml` 이 빌드·배포합니다.

## 원격 저장소 연결 예시

```bash
git remote add origin https://github.com/dmlwjd85/SiSort.git
git branch -M main
git push -u origin main
```
