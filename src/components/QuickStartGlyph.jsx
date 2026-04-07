import React from 'react';

/**
 * 빠른 시작 버튼용 ㄱㄴㄷ 썸네일(번개 대체) — 스토어·브랜드 일관
 */
export default function QuickStartGlyph({ className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-stretch gap-px rounded-md bg-teal-950/35 px-1 py-0.5 ring-1 ring-white/20 ${className}`.trim()}
      aria-hidden
    >
      {['ㄱ', 'ㄴ', 'ㄷ'].map((ch) => (
        <span key={ch} className="min-w-[1.1em] text-center text-base font-black leading-none text-teal-50 sm:text-lg">
          {ch}
        </span>
      ))}
    </span>
  );
}
