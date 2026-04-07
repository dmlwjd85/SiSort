import React from 'react';

/**
 * 로그인·로비 공통: 한지·가나다 한글 분위기 배경
 */
export default function KoreanThemeBackdrop() {
  const row = '가나다라마바사아자차카타파하';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-[#0c1924] to-slate-900" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_0%,rgba(45,212,191,0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_35%_at_100%_100%,rgba(56,189,248,0.06),transparent)]" />
      <div className="absolute inset-0 text-[min(3.5rem,9vw)] font-semibold leading-[1] tracking-tight text-teal-100/5">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden whitespace-nowrap text-center" style={{ opacity: 0.35 + (i % 2) * 0.2 }}>
            {row.repeat(14)}
          </div>
        ))}
      </div>
      <div className="absolute -left-10 bottom-28 h-40 w-40 rounded-full border border-teal-500/10 bg-teal-950/20 blur-[2px]" />
    </div>
  );
}
