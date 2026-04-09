import { Capacitor } from '@capacitor/core';

/**
 * 스토어 심사·고지용 정적 문서 URL (Vite base·Capacitor 웹뷰 origin 반영)
 * @param {string} path 예: 'legal/privacy.html'
 */
export function getLegalPageUrl(path) {
  const raw = String(path || '').replace(/^\//, '');
  const base = import.meta.env.BASE_URL || '/';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return new URL(raw, `${origin}${base.endsWith('/') ? base : `${base}/`}`).href;
}

/**
 * 개인정보처리방침·이용약관 열기 — 네이티브는 인앱 브라우저, 웹은 새 탭
 * @param {string} path 예: 'legal/privacy.html'
 */
export async function openLegalPage(path) {
  const url = getLegalPageUrl(path);
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url, presentationStyle: 'popover' });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
