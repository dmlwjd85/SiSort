import React from 'react';

/**
 * 하단 손패: 사용자 카드 클릭으로 제출
 */
export default function PlayerHand({
  userHand,
  handlePlayCard,
  gameState,
  isPaused,
  isHintMode,
  isPreparing
}) {
  return (
    <div className="bg-slate-800 p-4 sm:p-6 shadow-up z-10 border-t border-slate-700 pb-safe shrink-0">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-end mb-3">
          <span className="text-blue-300 font-bold text-sm sm:text-base">내 카드 (사전 순서가 가장 앞설 때 누르세요)</span>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          {userHand.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => handlePlayCard(card)}
              disabled={gameState !== 'playing' || isPaused || isHintMode || isPreparing}
              className="w-28 h-40 sm:w-32 sm:h-44 bg-white rounded-xl shadow-lg flex flex-col items-center justify-center p-3 text-slate-800 transition-transform hover:-translate-y-4 hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-50 disabled:hover:translate-y-0"
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
