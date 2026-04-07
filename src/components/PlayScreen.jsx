import React from 'react';
import GameHeader from './GameHeader.jsx';
import PlayArea from './PlayArea.jsx';
import PlayerHand from './PlayerHand.jsx';
import ResultModal from './ResultModal.jsx';

/**
 * 인게임 화면: 헤더·플레이 영역·손패·결과 모달
 */
export default function PlayScreen(props) {
  const {
    setGameState,
    startGame,
    level,
    TOTAL_LEVELS,
    hints,
    isHintMode,
    hintActorName,
    toggleHintMode,
    lives,
    gameState,
    isPaused,
    handleRevealAICard,
    lastPlayed,
    sortedPlayedStack,
    allCards,
    message,
    isPreparing,
    prepTimeLeft,
    skipPrep,
    userHand,
    handlePlayCard,
    reorderMyHandPrep,
    canReorderHand,
    guestPlayLocked,
    reviewedWords,
    setReviewedWords,
    startLevel,
    opponentSlots,
    cardsBySlot,
    getOwnerLabel,
    mySlotIndex,
    onLeaveLobby,
    netRoom,
    timeLeft,
    tableReviewSecondsLeft,
    gameOverExplain,
    pendingAfterTableReview,
    finishTableReview,
    saveOfflineRunAndGoLobby,
  } = props;

  const onlineGuestNoLocalRestart = !!(netRoom?.db && netRoom?.roomId && !netRoom?.isHost);

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col font-sans overflow-x-hidden overflow-y-auto overscroll-y-contain lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
      <GameHeader
        setGameState={setGameState}
        startGame={startGame}
        level={level}
        TOTAL_LEVELS={TOTAL_LEVELS}
        hints={hints}
        isHintMode={isHintMode}
        toggleHintMode={toggleHintMode}
        lives={lives}
        gameState={gameState}
        isPaused={isPaused}
        onLeaveLobby={onLeaveLobby}
        disableRestart={onlineGuestNoLocalRestart}
      />

      {gameState === 'table_review' && (
        <div className="shrink-0 z-[85] border-b border-amber-600/50 bg-slate-950/95 px-3 py-3 text-center shadow-lg md:px-4">
          <p className="text-[13px] font-bold text-amber-200 break-keep md:text-base">
            {pendingAfterTableReview === 'level_clear'
              ? '제출된 카드·순서를 확인한 뒤 복습으로 넘어갑니다.'
              : '어떤 순서가 틀렸는지 확인한 뒤 결과로 넘어갑니다.'}
          </p>
          {gameOverExplain?.kind === 'wrong_order' && (
            <p className="mt-2 text-[12px] text-slate-200 break-keep md:text-sm">
              잘못 제출: <strong className="text-white">{gameOverExplain.playedWord}</strong>
              {Array.isArray(gameOverExplain.missedWords) && gameOverExplain.missedWords.length > 0 ? (
                <>
                  {' '}
                  — 먼저 내야 할 단어:{' '}
                  <strong className="text-amber-100">{gameOverExplain.missedWords.join(' · ')}</strong>
                </>
              ) : null}
            </p>
          )}
          {gameOverExplain?.kind === 'timeout' && (
            <p className="mt-2 text-[12px] text-slate-300 break-keep md:text-sm">
              제한 시간 안에 사전 순서대로 가장 먼저 내야 할 카드가 나오지 않았습니다.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
            <span className="font-mono text-2xl font-black tabular-nums text-white md:text-3xl">
              {tableReviewSecondsLeft}
            </span>
            <span className="text-xs text-slate-400">초 후 자동 진행</span>
            <button
              type="button"
              onClick={() => finishTableReview()}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500"
            >
              바로 넘어가기
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-1 lg:flex-row lg:min-h-0 min-w-0">
        {/* 모바일: 첫 화면에서 게임 테이블이 손패에 가려지지 않도록 플레이 영역 최소 높이 확보 — 손패는 아래로 스크롤 */}
        <div className="flex flex-col w-full min-w-0 max-lg:flex-none max-lg:min-h-[min(52dvh,560px)] lg:flex-1 lg:min-h-0 lg:overflow-hidden">
          <PlayArea
            gameState={gameState}
            opponentSlots={opponentSlots}
            cardsBySlot={cardsBySlot}
            getOwnerLabel={getOwnerLabel}
            isHintMode={isHintMode}
            handleRevealAICard={handleRevealAICard}
            lastPlayed={lastPlayed}
            sortedPlayedStack={sortedPlayedStack}
            allCards={allCards}
            message={message}
            isPreparing={isPreparing}
            prepTimeLeft={prepTimeLeft}
            onSkipPrep={skipPrep}
            userHand={userHand}
            mySlotIndex={mySlotIndex}
          />
        </div>

        <div
          className={
            gameState === 'level_clear'
              ? 'max-md:hidden w-full shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end'
              : 'w-full shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end lg:min-h-0 max-lg:border-0 lg:border-l border-slate-700/60'
          }
        >
          {/* 손패 바로 위: 남은 시간(헤더에 두지 않아 카드 보며 고민할 때도 보임) */}
          {gameState === 'playing' && !isPreparing && (
            <div
              className="shrink-0 z-30 flex w-full items-center justify-center gap-2 border-b border-amber-500/35 bg-slate-950/95 px-3 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.35)] lg:rounded-t-xl lg:border lg:border-b-0 lg:border-slate-600/80"
              aria-live="polite"
            >
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">남은 시간</span>
              <span
                className={`font-black tabular-nums ${
                  Number.isFinite(timeLeft) && timeLeft > 0 && timeLeft <= 5
                    ? 'animate-pulse text-3xl text-amber-200 md:text-4xl'
                    : 'text-2xl text-slate-100 md:text-3xl'
                }`}
              >
                {Math.ceil(Number.isFinite(timeLeft) ? timeLeft : 0)}
                <span className="text-lg font-bold text-slate-400 md:text-xl">초</span>
              </span>
            </div>
          )}
          {gameState === 'playing' && isHintMode && hintActorName && (
            <div className="shrink-0 z-40 w-full border-b border-amber-500/50 bg-gradient-to-r from-amber-950/95 to-slate-900/95 px-3 py-2.5 text-center shadow-[0_-2px_12px_rgba(0,0,0,0.25)] touch-manipulation">
              <p className="text-[11px] font-bold leading-snug text-amber-100 md:text-sm break-keep">
                🔍 위쪽 상대 카드를 눌러 엿보기 ·{' '}
                <span className="text-amber-50">{hintActorName}</span>
              </p>
              <p className="mt-0.5 text-[10px] text-amber-200/80 md:text-xs">내 손패 바로 위 — 스크롤해도 이 안내가 함께 움직입니다</p>
            </div>
          )}
          <PlayerHand
            userHand={userHand}
            handlePlayCard={handlePlayCard}
            gameState={gameState}
            isPaused={isPaused}
            isHintMode={isHintMode}
            isPreparing={isPreparing}
            reorderMyHandPrep={reorderMyHandPrep}
            canReorderHand={canReorderHand}
            guestPlayLocked={guestPlayLocked}
          />
        </div>
      </div>

      <ResultModal
        gameState={gameState}
        level={level}
        TOTAL_LEVELS={TOTAL_LEVELS}
        reviewedWords={reviewedWords}
        setReviewedWords={setReviewedWords}
        allCards={allCards}
        startLevel={startLevel}
        setGameState={setGameState}
        onGoLobby={onLeaveLobby}
        gameOverExplain={gameOverExplain}
        canSaveOffline={!netRoom?.db}
        onSaveRunAndExit={saveOfflineRunAndGoLobby}
      />
    </div>
  );
}
