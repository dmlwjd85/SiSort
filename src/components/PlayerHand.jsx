import React, { useState, useMemo, useCallback } from 'react';

/**
 * 하단 손패: 사용자 카드 클릭으로 제출
 * 살펴보기: [가나다 한번에 정렬] 버튼 · 드래그로 순서 변경(탭으로는 제출되지 않음)
 */
export default function PlayerHand({
  userHand,
  handlePlayCard,
  gameState,
  isPaused,
  isHintMode,
  isPreparing,
  reorderMyHandPrep,
  canReorderHand = false,
  guestPlayLocked,
  className = '',
}) {
  const [dragFrom, setDragFrom] = useState(null);

  const reorderFn = reorderMyHandPrep;
  const canReorder = Boolean(canReorderHand && reorderFn && userHand.length > 1);

  const sortHandByRank = useCallback(() => {
    if (!isPreparing || !canReorder || !reorderFn || userHand.length < 2) return;
    const sorted = [...userHand].sort((a, b) => a.rank - b.rank);
    reorderFn(sorted.map((c) => c.id));
  }, [isPreparing, canReorder, reorderFn, userHand]);

  const applyReorder = (fromIdx, toIdx) => {
    if (!canReorder || fromIdx === toIdx) return;
    const ids = userHand.map((c) => c.id);
    const next = [...ids];
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    reorderFn(next);
  };

  const wrongOrderIds = useMemo(() => {
    if (userHand.length <= 1) return new Set();
    const rankSorted = [...userHand].sort((a, b) => a.rank - b.rank);
    const bad = new Set();
    userHand.forEach((c, i) => {
      if (rankSorted[i]?.id !== c.id) bad.add(c.id);
    });
    return bad;
  }, [userHand]);

  const cannotPlayCard =
    gameState !== 'playing' || isPaused || isHintMode || isPreparing || guestPlayLocked;

  return (
    <div
      className={`bg-slate-900/90 backdrop-blur-sm md:bg-slate-800 md:backdrop-blur-none p-2.5 sm:p-4 lg:p-5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)] z-10 border-t border-slate-700/70 lg:border-t-0 pb-safe shrink-0 ${className}`.trim()}
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-2 sm:mb-3">
          <div className="flex flex-col gap-1 sm:gap-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sky-300 font-bold text-sm sm:text-base">내 카드</span>
              {!isPreparing && (
                <>
                  <span className="md:hidden text-[10px] font-bold text-sky-200/90 bg-sky-900/60 px-1.5 py-0.5 rounded border border-sky-600/50">
                    앞장 → 탭
                  </span>
                  <span className="hidden md:inline text-xs text-slate-500">앞설 때 탭</span>
                </>
              )}
            </div>
            {isPreparing && canReorder && userHand.length >= 2 && (
              <div className="flex justify-center sm:justify-start mb-1">
                <button
                  type="button"
                  onClick={sortHandByRank}
                  className="rounded-xl bg-amber-600 hover:bg-amber-500 active:bg-amber-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg min-h-[44px] touch-manipulation"
                >
                  가나다 한번에 정렬
                </button>
              </div>
            )}
            {isPreparing && (
              <>
                <div className="md:hidden flex flex-wrap items-center justify-center gap-1.5 text-[10px] leading-tight">
                  <span className="rounded-md bg-amber-500/25 text-amber-100 px-1.5 py-0.5 border border-amber-500/40">
                    정렬하기
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="rounded-md bg-amber-500/25 text-amber-100 px-1.5 py-0.5 border border-amber-500/40">
                    ↔순서
                  </span>
                  <span className="text-slate-500">|</span>
                  <span className="text-slate-400">탭 ✕</span>
                </div>
                <span className="hidden md:inline text-amber-300/95 text-xs break-keep leading-relaxed">
                  <strong className="text-amber-200">살펴보기:</strong> 위 <strong className="text-amber-200">가나다 한번에 정렬</strong> 버튼으로
                  맞추거나, <strong>드래그</strong>해 순서만 바꿀 수 있습니다. (탭으로는 제출되지 않습니다)
                </span>
              </>
            )}
            {!isPreparing && canReorder && (
              <span className="hidden md:inline text-emerald-300/95 text-xs">
                손패가 2장 이상이면 드래그해 사전 순서에 맞출 수 있습니다.
              </span>
            )}
            {!isPreparing && canReorder && (
              <span className="md:hidden text-[10px] text-emerald-400/90">↔ 밀어서 순서</span>
            )}
            {userHand.length > 1 && (
              <>
                <span className="md:hidden inline-flex items-center gap-1 text-[10px] text-rose-300 font-bold">
                  <span className="text-rose-400">⛔</span> 순서 틀림
                </span>
                <span className="hidden md:inline text-rose-400/90 text-[11px]">빨간 테두리 = 사전 순과 다름</span>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-center gap-2 sm:gap-3 flex-wrap">
          {userHand.map((card, index) => {
            const outOfOrder = wrongOrderIds.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                draggable={canReorder}
                style={{
                  touchAction: isPreparing && canReorder ? 'none' : undefined,
                  WebkitTapHighlightColor: 'transparent',
                }}
                onDragStart={(e) => {
                  if (!canReorder) return;
                  e.dataTransfer.setData('text/plain', String(index));
                  e.dataTransfer.effectAllowed = 'move';
                  setDragFrom(index);
                }}
                onDragEnd={() => setDragFrom(null)}
                onDragOver={(e) => {
                  if (!canReorder) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  if (!canReorder) return;
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (Number.isNaN(from)) return;
                  applyReorder(from, index);
                }}
                onClick={() => {
                  if (cannotPlayCard) return;
                  handlePlayCard(card);
                }}
                aria-disabled={cannotPlayCard}
                title={
                  isPreparing && canReorder && userHand.length > 1
                    ? '드래그: 순서 이동 · 가나다 정렬은 위쪽 버튼'
                    : undefined
                }
                className={`w-[6.25rem] h-[8.75rem] sm:w-32 sm:h-44 bg-white rounded-lg sm:rounded-xl shadow-md sm:shadow-lg flex flex-col items-center justify-center p-2 sm:p-3 text-slate-800 transition-transform select-none touch-manipulation ${
                  cannotPlayCard && !canReorder ? 'opacity-60' : ''
                } ${
                  canReorder
                    ? 'cursor-grab active:cursor-grabbing active:scale-[0.98] sm:hover:-translate-y-2 sm:hover:shadow-xl sm:hover:shadow-blue-500/25'
                    : cannotPlayCard
                      ? 'opacity-60 cursor-default'
                      : 'cursor-pointer active:scale-[0.98] sm:hover:-translate-y-2 sm:hover:shadow-xl sm:hover:shadow-blue-500/25'
                } ${dragFrom === index ? 'ring-2 ring-amber-400 opacity-90' : ''} ${
                  outOfOrder ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-slate-900 sm:ring-offset-2 sm:ring-offset-slate-800' : ''
                } ${isPreparing && canReorder ? 'touch-none' : ''}`}
              >
                <span className="text-xl sm:text-3xl font-black mb-1 sm:mb-2 leading-tight">{card.word}</span>
                <span className="text-[10px] sm:text-xs text-slate-600 text-center leading-tight break-keep line-clamp-4 sm:line-clamp-none">
                  {card.desc}
                </span>
              </button>
            );
          })}
          {userHand.length === 0 && (
            <div className="h-32 flex items-center justify-center w-full text-slate-500 italic">카드를 모두 냈습니다!</div>
          )}
        </div>
      </div>
    </div>
  );
}
