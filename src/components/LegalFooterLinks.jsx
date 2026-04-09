import React from 'react';
import { openLegalPage } from '../lib/openLegalPage.js';

/**
 * 로그인·로비 하단: 스토어 필수 고지 링크
 */
export default function LegalFooterLinks({ className = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-500 ${className}`.trim()}>
      <button
        type="button"
        className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
        onClick={() => void openLegalPage('legal/privacy.html')}
      >
        개인정보처리방침
      </button>
      <span className="text-slate-600" aria-hidden>
        ·
      </span>
      <button
        type="button"
        className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
        onClick={() => void openLegalPage('legal/terms.html')}
      >
        이용약관
      </button>
    </div>
  );
}
