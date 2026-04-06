import React from 'react';

/**
 * 레벨 클리어 / 게임 오버 / 최종 승리 모달
 */
export default function ResultModal({
  gameState,
  level,
  TOTAL_LEVELS,
  reviewedWords,
  setReviewedWords,
  allCards,
  startLevel,
  setGameState
}) {
  if (gameState !== 'level_clear' && gameState !== 'game_over' && gameState !== 'victory') return null;

  return (
    <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center z-50 backdrop-blur-md p-4">
      {gameState === 'level_clear' && (
        <div className="max-w-2xl w-full flex flex-col items-center">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-4xl font-black text-green-400 mb-2">레벨 {level} 클리어!</h2>
          {level % 2 === 0 && <p className="text-yellow-400 font-bold mb-4">보너스! &apos;길라잡이&apos;를 1개 얻었습니다.</p>}

          <div className="w-full bg-slate-800 rounded-xl p-4 mb-6 max-h-[45vh] overflow-y-auto border border-slate-600">
            <h3 className="text-lg font-bold text-white mb-2 text-center border-b border-slate-700 pb-2">이번 레벨 완성 사전</h3>
            <p className="text-xs text-yellow-400 text-center mb-3 animate-pulse break-keep">
              모든 단어를 터치하여 뜻을 복습해야 다음 레벨로 갈 수 있습니다! ({reviewedWords.length}/{allCards.length})
            </p>
            <ul className="space-y-2">
              {allCards.sort((a, b) => a.rank - b.rank).map((c, i) => {
                const isReviewed = reviewedWords.includes(c.id);
                return (
                  <li
                    key={c.id}
                    onClick={() => {
                      if (!isReviewed) setReviewedWords(prev => [...prev, c.id]);
                    }}
                    className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                      isReviewed ? 'bg-blue-900/40 border-2 border-blue-400 shadow-inner' : 'bg-slate-700/50 hover:bg-slate-700 border-2 border-transparent'
                    }`}
                  >
                    <span className={`${isReviewed ? 'bg-blue-500' : 'bg-slate-600'} text-white text-xs font-bold px-2 py-1 rounded min-w-[24px] text-center transition-colors shrink-0 mt-1`}>
                      {i + 1}
                    </span>

                    <div className="flex-1 break-words leading-relaxed">
                      <span className={`font-bold text-xl transition-colors ${isReviewed ? 'text-blue-300' : 'text-white'}`}>
                        {c.word}
                      </span>

                      {isReviewed && (
                        <span className="ml-2 text-base text-yellow-200 bg-slate-800/80 px-2 py-1 rounded-md animate-fade-in inline-block border border-yellow-500/30">
                          ✨ {c.desc}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => (level === TOTAL_LEVELS ? setGameState('victory') : startLevel(level + 1))}
            disabled={reviewedWords.length < allCards.length}
            className={`px-8 py-3 rounded-full font-bold text-xl transition-all shadow-lg w-full max-w-sm ${
              reviewedWords.length === allCards.length
                ? 'bg-green-500 hover:bg-green-400 text-white cursor-pointer'
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'
            }`}
          >
            {level === TOTAL_LEVELS ? '최종 결과 보기' : '다음 레벨로'}
          </button>
        </div>
      )}

      {gameState === 'game_over' && (
        <div className="text-center">
          <div className="text-6xl mb-6">💀</div>
          <h2 className="text-4xl font-black text-red-500 mb-4">게임 오버</h2>
          <p className="text-slate-300 mb-8">생명력을 모두 잃었습니다. (도달 레벨: {level})</p>
          <button
            type="button"
            onClick={() => setGameState('home')}
            className="bg-slate-600 hover:bg-slate-500 text-white px-8 py-3 rounded-full font-bold text-xl transition-colors"
          >
            처음으로 돌아가기
          </button>
        </div>
      )}

      {gameState === 'victory' && (
        <div className="text-center">
          <div className="text-6xl mb-6">🏆</div>
          <h2 className="text-5xl font-black text-yellow-400 mb-4">최종 승리!</h2>
          <p className="text-slate-300 mb-8">모든 레벨의 사전 순서를 마스터하셨습니다!</p>
          <button
            type="button"
            onClick={() => setGameState('home')}
            className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-8 py-3 rounded-full font-bold text-xl transition-colors shadow-lg shadow-yellow-500/50"
          >
            다시 플레이
          </button>
        </div>
      )}
    </div>
  );
}
