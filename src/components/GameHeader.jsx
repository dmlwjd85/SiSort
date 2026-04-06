import React from 'react';

/**
 * 플레이 화면 상단: 홈/처음부터, 레벨, 길라잡이, 생명력 (남은 시간은 PlayScreen 손패 위 바)
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
}) {
  /* Firestore 동기화·실수 다중 차감 시 생명 표시 (상한 99) */
  const safeLives = Math.max(0, Math.min(99, Number.isFinite(Number(lives)) ? Math.floor(Number(lives)) : 0));

  return (
    <div className="shrink-0 bg-slate-900/95 backdrop-blur-sm z-10 border-b border-slate-700/60 md:bg-slate-800 md:backdrop-blur-none">
      <div className="w-full max-w-[min(100%,90rem)] mx-auto px-2 py-2 sm:px-3 sm:py-3 md:p-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-between sm:items-center sm:gap-2">
        <div className="flex items-center justify-between gap-1.5 sm:justify-start sm:gap-2 md:gap-4 min-w-0">
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onLeaveLobby) onLeaveLobby();
                else setGameState('home');
              }}
              className="bg-slate-700/90 hover:bg-slate-600 text-white px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm md:text-base font-bold transition-colors"
              title="로비로 나가기"
              aria-label="로비로 나가기"
            >
              <span className="md:hidden" aria-hidden>
                🏠
              </span>
              <span className="hidden md:inline">🏠 로비</span>
            </button>
            <button
              type="button"
              onClick={startGame}
              className="bg-slate-700/90 hover:bg-slate-600 text-white px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs sm:text-sm md:text-base font-bold transition-colors"
              title="1레벨부터 다시 시작하기"
              aria-label="처음부터 다시 시작"
            >
              <span className="md:hidden" aria-hidden>
                🔄
              </span>
              <span className="hidden md:inline">🔄 처음부터</span>
            </button>
          </div>
          <div className="text-sm sm:text-lg md:text-xl font-black bg-slate-700/90 px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-sky-300 tabular-nums shrink-0">
            Lv.{level}
            <span className="text-slate-500 font-bold text-[10px] sm:text-xs md:text-sm ml-1">/{TOTAL_LEVELS}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3 md:gap-4 flex-wrap">
          <button
            type="button"
            onClick={toggleHintMode}
            disabled={hints <= 0 || isPaused || gameState !== 'playing'}
            className={`font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-full text-xs sm:text-sm md:text-base border transition-colors shrink-0 ${
              isHintMode ? 'bg-amber-400 text-slate-900 border-amber-400 animate-pulse'
                : hints > 0 ? 'border-amber-500/80 text-amber-200 hover:bg-amber-500/15' : 'border-slate-600 text-slate-600'
            }`}
          >
            <span className="md:hidden">🔍 {hints}</span>
            <span className="hidden md:inline">🔍 길라잡이 {hints}</span>
          </button>
          <div className="text-lg sm:text-xl md:text-2xl tracking-wider text-rose-400 tabular-nums shrink-0">
            {safeLives > 12 ? (
              <span className="font-bold">♥{safeLives}</span>
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
