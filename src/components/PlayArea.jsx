import React from 'react';

/**
 * AI 영역, 중앙 카드, 사전 목록, 메시지·준비 오버레이
 */
export default function PlayArea({
  ai1Cards,
  ai2Cards,
  isHintMode,
  handleRevealAICard,
  lastPlayed,
  sortedPlayedStack,
  allCards,
  message,
  isPreparing,
  prepTimeLeft,
  userHand
}) {
  const ais = [
    { id: 'ai1', name: '가상 플레이어 1', cards: ai1Cards, chipClass: 'bg-purple-900/50 border border-purple-500 text-purple-200' },
    { id: 'ai2', name: '가상 플레이어 2', cards: ai2Cards, chipClass: 'bg-indigo-900/50 border border-indigo-500 text-indigo-200' }
  ];

  return (
    <div className="flex-1 relative flex flex-col items-center justify-start p-4 overflow-y-auto">
      <div className="w-full max-w-4xl flex justify-center gap-8 sm:gap-32 mt-4">
        {ais.map((ai) => (
          <div key={ai.id} className="flex flex-col items-center">
            <div className={`${ai.chipClass} px-3 py-1 rounded-lg mb-2 text-sm font-bold`}>
              🤖 {ai.name}
            </div>
            <div className="flex gap-1">
              {ai.cards.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleRevealAICard(c.id)}
                  disabled={!isHintMode || c.revealed}
                  className={`w-12 h-16 sm:w-14 sm:h-20 rounded shadow-sm flex flex-col items-center justify-center transition-transform ${
                    c.revealed
                      ? 'bg-white border-2 border-yellow-400 scale-110 z-10'
                      : isHintMode
                        ? 'bg-yellow-400/20 border border-yellow-400 animate-pulse hover:bg-yellow-400/40 cursor-pointer'
                        : 'bg-slate-700 border border-slate-600'
                  }`}
                >
                  {c.revealed ? (
                    <span className="text-slate-900 font-bold text-sm sm:text-base">{c.word}</span>
                  ) : (
                    <span className="text-slate-500 text-xs">?</span>
                  )}
                </button>
              ))}
              {ai.cards.length === 0 && <span className="text-xs text-slate-500 mt-2">완료</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="w-56 h-72 border-4 border-dashed border-slate-600 rounded-3xl flex flex-col items-center justify-center relative bg-slate-800/50 shadow-inner mt-8">
        {lastPlayed ? (
          <div className={`absolute inset-0 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center p-4 text-center animate-bounce-short border-4 ${lastPlayed.owner === 'user' ? 'border-blue-400' : 'border-purple-400'}`}>
            <span className="text-5xl font-black text-slate-800 mb-2">{lastPlayed.word}</span>
            <span className="text-sm text-slate-600 font-medium break-keep">{lastPlayed.desc}</span>
            <span className="absolute bottom-3 text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
              {lastPlayed.owner === 'user' ? '내가 냄' : 'AI가 냄'}
            </span>
          </div>
        ) : (
          <span className="text-slate-500 font-medium text-center px-4">
            가장 먼저 올 단어를<br />눈치껏 내세요!
          </span>
        )}
      </div>

      <div className="w-full max-w-4xl mt-8 bg-slate-800/80 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
          <span>📜 완성되어 가는 사전</span>
          <span className="bg-slate-700 px-2 py-0.5 rounded-full text-xs">{sortedPlayedStack.length} / {allCards.length}</span>
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-600">
          {sortedPlayedStack.map((card) => (
            <div key={card.id} className="min-w-[100px] bg-slate-700 rounded-lg p-2 flex flex-col justify-between shrink-0 border border-slate-600">
              <div className="text-lg font-bold text-white text-center border-b border-slate-600 pb-1 mb-1">{card.word}</div>
              <div className="text-[10px] text-slate-300 text-center leading-tight line-clamp-2">{card.desc}</div>
              <div className="text-[9px] text-slate-500 text-center mt-1">순서: {card.rank + 1}</div>
            </div>
          ))}
          {sortedPlayedStack.length === 0 && (
            <div className="text-slate-500 text-sm italic py-2">아직 제출된 단어가 없습니다.</div>
          )}
        </div>
      </div>

      {message && (
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-slate-900/95 border-2 border-yellow-500 text-white px-8 py-6 rounded-2xl text-xl font-bold shadow-2xl z-50 text-center whitespace-pre-line animate-fade-in-up">
          {message}
        </div>
      )}

      {isPreparing && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md rounded-xl">
          <h2 className="text-3xl md:text-4xl font-bold text-yellow-400 mb-8 animate-pulse text-center px-4 break-keep">
            내 카드를 확인하고 순서를 예상하세요!
          </h2>

          <div className="flex justify-center gap-4 flex-wrap mb-10 w-full px-4">
            {userHand.map((card) => (
              <div
                key={card.id}
                className="w-32 h-44 sm:w-36 sm:h-48 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center p-3 text-slate-800 border-4 border-blue-400"
              >
                <span className="text-3xl sm:text-4xl font-black mb-2">{card.word}</span>
                <span className="text-sm text-slate-600 text-center leading-tight break-keep">{card.desc}</span>
              </div>
            ))}
          </div>

          <div className="text-7xl sm:text-8xl font-black text-white drop-shadow-2xl">
            {prepTimeLeft}
          </div>
        </div>
      )}
    </div>
  );
}
