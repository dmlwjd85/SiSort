import React from 'react';

/**
 * 로그인·로비 공통: 한지·가나다 한글 분위기 배경
 */
export default function KoreanThemeBackdrop() {
  const row = '가나다라마바사아자차카타파하';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#1c1410] via-[#0f172a] to-[#1a1c2e]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,119,6,0.18),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(59,130,246,0.12),transparent)]" />
      <div className="absolute inset-0 opacity-[0.06] text-[min(4.5rem,11vw)] font-black leading-[0.95] text-amber-100 tracking-tight">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="whitespace-nowrap overflow-hidden text-center" style={{ opacity: 0.5 + (i % 3) * 0.15 }}>
            {row.repeat(20)}
          </div>
        ))}
      </div>
      <div className="absolute -right-16 top-24 h-48 w-48 rounded-full border-4 border-red-800/20 bg-red-950/10 blur-[1px]" />
      <div className="absolute -left-8 bottom-32 h-32 w-32 rounded-full border-2 border-amber-600/15" />
    </div>
  );
}
