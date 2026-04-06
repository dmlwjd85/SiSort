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
    <div className="h-[100dvh] min-h-0 bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden">
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

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 min-w-0">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
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
              ? 'max-md:hidden shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end'
              : 'shrink-0 lg:w-[min(42vw,26rem)] lg:max-w-md lg:min-w-[260px] lg:flex lg:flex-col lg:justify-end min-h-0 border-t lg:border-t-0 lg:border-l border-slate-700/60'
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
