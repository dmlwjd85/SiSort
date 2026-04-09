import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initAuthPersistence } from './lib/authService.js'

/** Capacitor 네이티브: 상태 표시줄·스플래시 정리 */
async function initNativeShell() {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setOverlaysWebView({ overlay: true })
  } catch (e) {
    console.warn('[native] StatusBar', e)
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide()
  } catch (e) {
    console.warn('[native] SplashScreen', e)
  }
}

/* 처리되지 않은 예외 로그 (흰 화면 원인 추적용) */
window.addEventListener('error', (e) => {
  console.error('[window.error]', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandledrejection]', e.reason);
});

const root = createRoot(document.getElementById('root'))
const appTree = (
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

void initAuthPersistence().finally(() => {
  /* 프로덕션에서 StrictMode 이중 마운트로 인한 예외·깜빡임 완화 */
  root.render(import.meta.env.DEV ? <StrictMode>{appTree}</StrictMode> : appTree)
  requestAnimationFrame(() => {
    void initNativeShell()
  })
})
