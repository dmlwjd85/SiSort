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
  timeLeft,
  getLevelTime,
  onLeaveLobby,
}) {
  /* Firestore 동기화 값이 비정상일 때 repeat 등에서 예외가 나지 않도록 상한 적용 */
  const safeLives = Math.max(0, Math.min(3, Number.isFinite(Number(lives)) ? Math.floor(Number(lives)) : 0));
  const emptyHearts = Math.max(0, 3 - safeLives);
  const maxTime = getLevelTime(Math.max(1, Number(level) || 1));
  const barPct =
    maxTime > 0 ? Math.min(100, (Math.max(0, Number(timeLeft) || 0) / maxTime) * 100) : 0;

  return (
    <div className="bg-slate-800 p-4 shadow-md z-10">
      <div className="max-w-5xl mx-auto flex flex-wrap justify-between items-center gap-2">
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

        <div className="flex items-center gap-2 sm:gap-4">
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
            {'♥'.repeat(safeLives)}{'♡'.repeat(emptyHearts)}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto mt-4">
        <div className="flex justify-between text-sm font-bold mb-1">
          <span className={timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-slate-300'}>남은 시간</span>
          <span className={timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-slate-300'}>{Math.max(0, timeLeft).toFixed(1)}초</span>
        </div>
        <div className="w-full bg-slate-700 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-100 ease-linear ${timeLeft <= 5 ? 'bg-red-500' : 'bg-green-400'}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
