/* eslint-disable react-hooks/exhaustive-deps -- 원본 의존성 배열([timeLeft, gameState, ...])과 동일 */
import { useState, useEffect } from 'react';
import { PACK_DATA } from '../data/words.js';
import { shuffleArray, getLevelTime } from '../utils/helpers.js';

const AI_COUNT = 2;
const TOTAL_LEVELS = 10;

export function useSilentDictionaryGame() {
  const [gameState, setGameState] = useState('home'); // home, playing, level_clear, game_over, victory
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(20.0);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState('');

  const [usedWords, setUsedWords] = useState([]);
  const [hints, setHints] = useState(2);
  const [isHintMode, setIsHintMode] = useState(false);
  const [reviewedWords, setReviewedWords] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [showWordList, setShowWordList] = useState(false);

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepTimeLeft, setPrepTimeLeft] = useState(5);

  const [selectedPackKey, setSelectedPackKey] = useState('grade6');
  const currentWordDB = PACK_DATA[selectedPackKey].words;

  const [allCards, setAllCards] = useState([]);
  const [playedStack, setPlayedStack] = useState([]);

  const startLevel = (targetLevel, keepUsedWords = true) => {
    const totalPlayers = 1 + AI_COUNT;
    const cardsPerPlayer = targetLevel;
    const totalCardsNeeded = totalPlayers * cardsPerPlayer;

    let availableWords = currentWordDB.filter(w => !(keepUsedWords && usedWords.includes(w.word)));

    if (availableWords.length < totalCardsNeeded) {
      setUsedWords([]);
      availableWords = currentWordDB;
    }

    const shuffledDB = shuffleArray(availableWords);
    const selectedWords = shuffledDB.slice(0, totalCardsNeeded);

    if (keepUsedWords) {
      setUsedWords(prev => [...prev, ...selectedWords.map(w => w.word)]);
    }

    let owners = [];
    for (let i = 0; i < cardsPerPlayer; i++) owners.push('user');
    for (let i = 0; i < cardsPerPlayer; i++) owners.push('ai1');
    for (let i = 0; i < cardsPerPlayer; i++) owners.push('ai2');
    owners = shuffleArray(owners);

    const sortedWords = [...selectedWords].sort((a, b) => a.word.localeCompare(b.word, 'ko'));
    const currentLevelTime = getLevelTime(targetLevel);

    const cards = selectedWords.map((item, idx) => {
      const rank = sortedWords.findIndex(sw => sw.word === item.word);
      const targetTime = currentLevelTime - (currentLevelTime / (totalCardsNeeded + 1)) * (rank + 1);

      return {
        id: `${item.word}-${idx}`,
        word: item.word,
        desc: item.desc,
        owner: owners[idx],
        rank,
        targetTime,
        status: 'hand',
        revealed: false
      };
    });

    setAllCards(cards);
    setPlayedStack([]);
    setLevel(targetLevel);
    setTimeLeft(currentLevelTime);
    setIsPaused(false);
    setIsHintMode(false);
    setReviewedWords([]);

    setIsPreparing(true);
    setPrepTimeLeft(5);
    setMessage('');
    setGameState('playing');
  };

  const startGame = () => {
    setLives(3);
    setHints(2);
    setUsedWords([]);
    startLevel(1, false);
  };

  const toggleHintMode = () => {
    if (hints > 0 && !isHintMode) {
      setIsHintMode(true);
      setMessage(`[길라잡이]\n원하는 AI의 엎어진 카드를 클릭하여 엿보세요!`);
    } else if (isHintMode) {
      setIsHintMode(false);
      setMessage('');
    }
  };

  const handleRevealAICard = (cardId) => {
    if (!isHintMode) return;

    setAllCards(prev => prev.map(c => c.id === cardId ? { ...c, revealed: true } : c));
    setHints(prev => prev - 1);
    setIsHintMode(false);
    setMessage('');
  };

  const handlePlayCard = (cardToPlay) => {
    if (gameState !== 'playing' || isPaused || isPreparing) return;

    const unplayedCards = allCards.filter(c => c.status === 'hand');
    if (unplayedCards.length === 0) return;

    const lowestRank = Math.min(...unplayedCards.map(c => c.rank));

    if (cardToPlay.rank === lowestRank) {
      setAllCards(prev => prev.map(c => c.id === cardToPlay.id ? { ...c, status: 'played' } : c));
      setPlayedStack(prev => [...prev, cardToPlay]);

      if (unplayedCards.length === 1) {
        setIsPaused(true);
        if (level % 2 === 0) setHints(h => h + 1);
        setGameState('level_clear');
      }
    } else {
      handleMistake(cardToPlay);
    }
  };

  const handleMistake = (wrongCard) => {
    setIsPaused(true);
    setPlayedStack(prev => [...prev, wrongCard]);

    setAllCards(prev => {
      return prev.map(c => {
        if (c.id === wrongCard.id) return { ...c, status: 'played' };
        if (c.status === 'hand' && c.rank < wrongCard.rank) {
          setPlayedStack(stack => [...stack, c]);
          return { ...c, status: 'discarded' };
        }
        return c;
      });
    });

    const newLives = lives - 1;
    setLives(newLives);

    if (newLives <= 0) {
      setGameState('game_over');
    } else {
      setMessage(`앗! 누군가 더 앞선 단어를 가지고 있습니다.\n(생명력 -1)`);
      setTimeout(() => {
        setMessage('');
        setIsPaused(false);
      }, 2500);
    }
  };

  const handleTimeout = () => {
    setIsPaused(true);
    const newLives = lives - 1;
    setLives(newLives);

    if (newLives <= 0) {
      setGameState('game_over');
    } else {
      setMessage(`시간 초과! 시간이 지났습니다.\n(생명력 -1, 레벨 다시 시작)`);
      setTimeout(() => {
        startLevel(level, false);
      }, 3000);
    }
  };

  const checkAiPlays = (currentTime) => {
    const aiCardsToPlay = allCards.filter(
      c => c.status === 'hand' && c.owner !== 'user' && c.targetTime >= currentTime
    );
    if (aiCardsToPlay.length > 0) {
      handlePlayCard(aiCardsToPlay[0]);
    }
  };

  useEffect(() => {
    if (gameState !== 'playing' || !isPreparing) return;
    if (prepTimeLeft <= 0) {
      setIsPreparing(false);
      setMessage('시작!');
      setTimeout(() => setMessage(''), 1000);
      return;
    }
    const timer = setTimeout(() => {
      setPrepTimeLeft(prev => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [prepTimeLeft, isPreparing, gameState]);

  useEffect(() => {
    if (gameState !== 'playing' || isPaused || isHintMode || isPreparing) return;

    if (timeLeft <= 0) {
      handleTimeout();
      return;
    }

    const timer = setTimeout(() => {
      const newTime = timeLeft - 0.1;
      setTimeLeft(newTime);
      checkAiPlays(newTime);
    }, 100);

    return () => clearTimeout(timer);
  }, [timeLeft, gameState, isPaused, isHintMode, isPreparing, allCards]);

  const userHand = allCards.filter(c => c.owner === 'user' && c.status === 'hand').sort((a, b) => a.rank - b.rank);
  const ai1Cards = allCards.filter(c => c.owner === 'ai1' && c.status === 'hand');
  const ai2Cards = allCards.filter(c => c.owner === 'ai2' && c.status === 'hand');
  const lastPlayed = playedStack.length > 0 ? playedStack[playedStack.length - 1] : null;
  const sortedPlayedStack = [...playedStack].sort((a, b) => a.rank - b.rank);

  return {
    PACK_DATA,
    gameState,
    setGameState,
    level,
    lives,
    timeLeft,
    isPaused,
    message,
    hints,
    isHintMode,
    reviewedWords,
    setReviewedWords,
    showRules,
    setShowRules,
    showWordList,
    setShowWordList,
    isPreparing,
    prepTimeLeft,
    selectedPackKey,
    setSelectedPackKey,
    currentWordDB,
    allCards,
    playedStack,
    TOTAL_LEVELS,
    AI_COUNT,
    getLevelTime,
    startLevel,
    startGame,
    toggleHintMode,
    handleRevealAICard,
    handlePlayCard,
    userHand,
    ai1Cards,
    ai2Cards,
    lastPlayed,
    sortedPlayedStack
  };
}
