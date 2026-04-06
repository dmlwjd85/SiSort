import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import DraggablePanel from './DraggablePanel.jsx';

/**
 * 족보 단어장: body에 포털로 그려 뷰포트 정중앙에 표시 (스크롤·모바일 주소창 영향 완화)
 */
export default function JokboWordListModal({
  open,
  packTitle,
  currentWordDB,
  onClose,
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const words = Array.isArray(currentWordDB) ? currentWordDB : [];
  const sorted = [...words].sort((a, b) =>
    String(a.word).localeCompare(String(b.word), 'ko')
  );

  /* animate-fade-in-up 은 translate(-50%)라 flex 중앙 정렬 레이아웃을 깨뜨림 → fade-in만 사용 */
  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-900/70 p-4 sm:p-6 animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="jokbo-wordlist-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-2xl justify-center" onClick={(e) => e.stopPropagation()}>
        <DraggablePanel className="flex max-h-[min(85dvh,40rem)] min-w-0 w-full max-w-2xl flex-col rounded-3xl border-2 border-green-500 bg-slate-800 shadow-2xl">
          <div className="flex flex-col overflow-hidden p-4 sm:p-6">
        <h2
          id="jokbo-wordlist-title"
          className="mb-2 text-center text-3xl font-bold text-green-400"
        >
          📚 {packTitle} 족보
        </h2>
        <p className="mb-4 text-center text-sm text-slate-400">
          여기에 있는 {words.length}개의 단어들이 게임에 출제됩니다.
        </p>
        <div className="scrollbar-thin scrollbar-thumb-slate-600 mb-4 min-h-0 flex-1 overflow-y-auto rounded-xl bg-slate-900/50 p-4">
          <ul className="space-y-2">
            {sorted.map((c, i) => (
              <li
                key={`${c.word}-${i}`}
                className="flex flex-col gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3 sm:flex-row sm:items-center"
              >
                <span className="min-w-[30px] rounded bg-green-600 px-2 py-1 text-center text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-[60px] text-xl font-bold text-white">
                  {c.word}
                </span>
                <span className="break-keep text-sm text-slate-300">{c.desc}</span>
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-full bg-green-600 py-4 text-xl font-bold text-white shadow-lg transition-colors hover:bg-green-500"
        >
          닫기
        </button>
          </div>
        </DraggablePanel>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
