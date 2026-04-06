import React, { useState, useMemo } from 'react';

/**
 * 하단 손패: 사용자 카드 클릭으로 제출
 * 살펴보기·대기·일시정지 중에도 드래그로 순서 변경(disabled 버튼은 드래그가 막히므로 클릭만 막음)
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
}) {
  const [dragFrom, setDragFrom] = useState(null);

  const reorderFn = reorderMyHandPrep;
  const canReorder = Boolean(canReorderHand && reorderFn && userHand.length > 1);

  const applyReorder = (fromIdx, toIdx) => {
    if (!canReorder || fromIdx === toIdx) return;
    const ids = userHand.map((c) => c.id);
    const next = [...ids];
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    reorderFn(next);
  };

  /** 사전 순(rank)과 화면 순이 다르면 해당 카드에 빨간 테두리 */
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
    <div className="bg-slate-800 p-4 sm:p-6 shadow-up z-10 border-t border-slate-700 pb-safe shrink-0">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-blue-300 font-bold text-sm sm:text-base">
              내 카드 (사전 순서가 가장 앞설 때 누르세요)
            </span>
            {isPreparing && (
              <span className="text-amber-300/95 text-xs">
                살펴보기 시간: 카드를 드래그해 순서만 바꿀 수 있습니다(버튼은 눌러도 제출되지 않습니다).
              </span>
            )}
            {!isPreparing && canReorder && (
              <span className="text-emerald-300/95 text-xs">
                플레이 중에도 손패가 2장 이상이면 언제든 드래그해 사전 순서에 맞출 수 있습니다.
              </span>
            )}
            {userHand.length > 1 && (
              <span className="text-rose-300/90 text-[11px]">
                빨간 테두리: 지금 순서가 사전 순서와 다릅니다.
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          {userHand.map((card, index) => {
            const outOfOrder = wrongOrderIds.has(card.id);
            return (
              <button
                key={card.id}
                type="button"
                draggable={canReorder}
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
                className={`w-28 h-40 sm:w-32 sm:h-44 bg-white rounded-xl shadow-lg flex flex-col items-center justify-center p-3 text-slate-800 transition-transform ${
                  cannotPlayCard && !canReorder ? 'opacity-60' : ''
                } ${
                  canReorder
                    ? 'cursor-grab active:cursor-grabbing hover:-translate-y-4 hover:shadow-xl hover:shadow-blue-500/30'
                    : cannotPlayCard
                      ? 'opacity-60 cursor-default'
                      : 'cursor-pointer hover:-translate-y-4 hover:shadow-xl hover:shadow-blue-500/30'
                } ${dragFrom === index ? 'ring-2 ring-amber-400 opacity-90' : ''} ${
                  outOfOrder ? 'ring-2 ring-red-500 ring-offset-2 ring-offset-slate-800' : ''
                }`}
              >
                <span className="text-2xl sm:text-3xl font-black mb-2">{card.word}</span>
                <span className="text-xs text-slate-600 text-center leading-tight break-keep">{card.desc}</span>
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
