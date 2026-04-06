import React, { useState } from 'react';

/**
 * 하단 손패: 사용자 카드 클릭으로 제출
 * 살펴보기(준비) 시간에만 드래그로 순서 변경 가능
 */
export default function PlayerHand({
  userHand,
  handlePlayCard,
  gameState,
  isPaused,
  isHintMode,
  isPreparing,
  reorderMyHandPrep,
}) {
  const [dragFrom, setDragFrom] = useState(null);

  const canReorder = Boolean(isPreparing && reorderMyHandPrep && userHand.length > 1);

  const applyReorder = (fromIdx, toIdx) => {
    if (!canReorder || fromIdx === toIdx) return;
    const ids = userHand.map((c) => c.id);
    const next = [...ids];
    const [removed] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, removed);
    reorderMyHandPrep(next);
  };

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
                살펴보기 시간: 카드를 드래그해 순서만 바꿀 수 있습니다.
              </span>
            )}
          </div>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          {userHand.map((card, index) => (
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
              onClick={() => handlePlayCard(card)}
              disabled={gameState !== 'playing' || isPaused || isHintMode || isPreparing}
              className={`w-28 h-40 sm:w-32 sm:h-44 bg-white rounded-xl shadow-lg flex flex-col items-center justify-center p-3 text-slate-800 transition-transform hover:-translate-y-4 hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:hover:translate-y-0 ${
                canReorder ? 'cursor-grab active:cursor-grabbing' : ''
              } ${dragFrom === index ? 'ring-2 ring-amber-400 opacity-90' : ''}`}
            >
              <span className="text-2xl sm:text-3xl font-black mb-2">{card.word}</span>
              <span className="text-xs text-slate-600 text-center leading-tight break-keep">{card.desc}</span>
            </button>
          ))}
          {userHand.length === 0 && (
            <div className="h-32 flex items-center justify-center w-full text-slate-500 italic">카드를 모두 냈습니다!</div>
          )}
        </div>
      </div>
    </div>
  );
}
