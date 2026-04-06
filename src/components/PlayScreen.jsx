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
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden">
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
        userHand={userHand}
        mySlotIndex={mySlotIndex}
        hintActorName={hintActorName}
        isHintMode={isHintMode}
      />

      <div className={gameState === 'level_clear' ? 'max-md:hidden' : ''}>
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
