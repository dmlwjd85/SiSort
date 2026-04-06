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
    timeLeft,
  } = props;

  return (
    <div className="min-h-[100dvh] bg-slate-900 text-slate-100 flex flex-col font-sans overflow-x-hidden overflow-y-auto lg:h-[100dvh] lg:min-h-0 lg:overflow-hidden">
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
        timeLeft={timeLeft}
        isPreparing={isPreparing}
      />

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
            hintActorName={hintActorName}
          />
        </div>

        <div
          className={
            gameState === 'level_clear'
              ? 'max-md:hidden w-full shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end'
              : 'w-full shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end lg:min-h-0 max-lg:border-0 lg:border-l border-slate-700/60'
          }
        >
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
      />
    </div>
  );
}
