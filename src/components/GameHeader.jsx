import React from 'react';

/**
 * 플레이 화면 상단: 홈/처음부터, 레벨, 길라잡이, 생명력, 타이머 바
 */
export default function GameHeader({
  setGameState,
  startGame,
  level,
  TOTAL_LEVELS,
  hints,
  isHintMode,
  toggleHintMode,
  lives,
  gameState,
  isPaused,
  onLeaveLobby,
  /** 라운드 남은 시간(초) — 마지막 5초만 크게 표시 */
  timeLeft = 0,
  isPreparing = false,
}) {
  /* Firestore 동기화·실수 다중 차감 시 생명 표시 (상한 99) — 제한 시간은 로직만 유지하고 화면에는 표시하지 않음 */
  const safeLives = Math.max(0, Math.min(99, Number.isFinite(Number(lives)) ? Math.floor(Number(lives)) : 0));
  const showFinalCount =
    gameState === 'playing' &&
    !isPaused &&
    !isPreparing &&
    Number.isFinite(timeLeft) &&
    timeLeft > 0 &&
    timeLeft <= 5;

  return (
    <div className="shrink-0 bg-slate-800 p-3 sm:p-4 shadow-md z-10 border-b border-slate-700/80">
      <div className="w-full max-w-[min(100%,90rem)] mx-auto px-1 sm:px-2 flex flex-wrap justify-between items-center gap-2">
        <div className="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            onClick={() => {
              if (onLeaveLobby) onLeaveLobby();
              else setGameState('home');
            }}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-bold transition-colors shadow"
            title="로비로 나가기"
          >
            🏠 로비
          </button>
          <button
            type="button"
            onClick={startGame}
            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-2 rounded-lg text-sm sm:text-base font-bold transition-colors shadow"
            title="1레벨부터 다시 시작하기"
          >
            🔄 처음부터
          </button>
          <div className="text-lg sm:text-xl font-bold bg-slate-700 px-3 sm:px-4 py-2 rounded-lg text-blue-300">
            LEVEL {level} <span className="text-xs sm:text-sm text-slate-400 ml-1 sm:ml-2">/ {TOTAL_LEVELS}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
          {showFinalCount && (
            <div
              className="font-black tabular-nums rounded-xl px-4 py-2 border-2 border-amber-400 bg-amber-950/90 text-amber-100 text-2xl sm:text-3xl shadow-lg shadow-amber-900/50 animate-pulse"
              aria-live="polite"
            >
              {Math.ceil(timeLeft)}
            </div>
          )}
          <button
            type="button"
            onClick={toggleHintMode}
            disabled={hints <= 0 || isPaused || gameState !== 'playing'}
            className={`font-bold px-3 py-2 rounded-full text-sm sm:text-base border-2 transition-colors ${
              isHintMode ? 'bg-yellow-500 text-slate-900 border-yellow-500 animate-pulse'
                : hints > 0 ? 'border-yellow-500 text-yellow-400 hover:bg-yellow-500/20' : 'border-slate-600 text-slate-600'
            }`}
          >
            🔍 길라잡이: {hints}개
          </button>
          <div className="text-xl sm:text-2xl tracking-widest text-red-500 drop-shadow-md">
            {safeLives > 12 ? (
              <span className="font-bold">♥ ×{safeLives}</span>
            ) : (
              <>
                {'♥'.repeat(safeLives)}
                {safeLives <= 3 ? '♡'.repeat(3 - safeLives) : ''}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
