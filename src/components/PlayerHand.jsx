import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';

/** 살펴보기 중 꾹 눌러 한 번에 사전 순 정렬 */
const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 14;

/**
 * 하단 손패: 사용자 카드 클릭으로 제출
 * 살펴보기: 꾹 눌러 사전 순 정렬 · 드래그로 순서 변경(버튼은 disabled 없이 클릭만 차단)
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

  const longPressTimerRef = useRef(null);
  const pointerDownRef = useRef(null);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearLongPress(), [clearLongPress]);

  const sortHandByRank = useCallback(() => {
    if (!isPreparing || !canReorder || !reorderFn || userHand.length < 2) return;
    const sorted = [...userHand].sort((a, b) => a.rank - b.rank);
    reorderFn(sorted.map((c) => c.id));
  }, [isPreparing, canReorder, reorderFn, userHand]);

  const onPrepPointerDown = useCallback(
    (e) => {
      if (!isPreparing || !canReorder || userHand.length < 2) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointerDownRef.current = { x: e.clientX, y: e.clientY };
      clearLongPress();
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        pointerDownRef.current = null;
        sortHandByRank();
      }, LONG_PRESS_MS);
    },
    [isPreparing, canReorder, userHand.length, clearLongPress, sortHandByRank]
  );

  const onPrepPointerMove = useCallback(
    (e) => {
      if (!pointerDownRef.current || !longPressTimerRef.current) return;
      const dx = e.clientX - pointerDownRef.current.x;
      const dy = e.clientY - pointerDownRef.current.y;
      if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
        clearLongPress();
        pointerDownRef.current = null;
      }
    },
    [clearLongPress]
  );

  const onPrepPointerEnd = useCallback(() => {
    pointerDownRef.current = null;
    clearLongPress();
  }, [clearLongPress]);

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
    <div className="bg-slate-800 p-4 sm:p-6 shadow-up z-10 border-t border-slate-700 pb-safe shrink-0">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-blue-300 font-bold text-sm sm:text-base">
              내 카드 (사전 순서가 가장 앞설 때 누르세요)
            </span>
            {isPreparing && (
              <span className="text-amber-300/95 text-xs break-keep leading-relaxed">
                <strong className="text-amber-200">살펴보기:</strong> 카드를 <strong>꾹 눌러</strong> 사전 순으로 한 번에
                정렬하거나, <strong>드래그</strong>해 순서만 바꿀 수 있습니다. (탭으로는 제출되지 않습니다)
              </span>
            )}
            {!isPreparing && canReorder && (
              <span className="text-emerald-300/95 text-xs">
                손패가 2장 이상이면 드래그해 사전 순서에 맞출 수 있습니다.
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
                style={{ touchAction: isPreparing ? 'manipulation' : undefined }}
                onPointerDown={(e) => {
                  onPrepPointerDown(e);
                }}
                onPointerMove={isPreparing ? onPrepPointerMove : undefined}
                onPointerUp={isPreparing ? onPrepPointerEnd : undefined}
                onPointerCancel={isPreparing ? onPrepPointerEnd : undefined}
                onDragStart={(e) => {
                  clearLongPress();
                  pointerDownRef.current = null;
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
                title={isPreparing && canReorder && userHand.length > 1 ? '꾹 눌러 사전 순 정렬 · 드래그로 이동' : undefined}
                className={`w-28 h-40 sm:w-32 sm:h-44 bg-white rounded-xl shadow-lg flex flex-col items-center justify-center p-3 text-slate-800 transition-transform select-none ${
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
