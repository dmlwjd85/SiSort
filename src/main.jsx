import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

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
/* 프로덕션에서 StrictMode 이중 마운트로 인한 예외·깜빡임 완화 */
root.render(import.meta.env.DEV ? <StrictMode>{appTree}</StrictMode> : appTree)
