import React from 'react';

/**
 * lazy 라우트·모달 청크 로딩 시 짧은 피드백 (학습앱 스타일 최소 스피너)
 */
export default function RouteFallback() {
  return (
    <div className="flex min-h-[50svh] w-full flex-1 flex-col items-center justify-center gap-3 bg-slate-900 px-4 font-sans text-slate-400">
      <div
        className="h-9 w-9 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-400"
        aria-hidden
      />
      <p className="text-sm font-medium text-slate-500">화면 불러오는 중…</p>
    </div>
  );
}
