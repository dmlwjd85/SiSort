import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PACK_DATA } from '../data/words.js';
import { shuffleArray, getLevelTime } from '../utils/helpers.js';
import {
  startRoomGame,
  updateRoomGame,
  subscribeRoom,
  subscribeActions,
  deleteActionDoc,
  pushPlayAction,
} from '../lib/roomService.js';

const TOTAL_LEVELS = 10;

export { TOTAL_LEVELS };

function slotOwner(i) {
  return `s${i}`;
}

function parseSlot(owner) {
  const n = parseInt(String(owner).replace(/^s/, ''), 10);
  return Number.isNaN(n) ? -1 : n;
}

export function serializeGame(s) {
  return {
    v: 1,
    gameState: s.gameState,
    level: s.level,
    lives: s.lives,
    timeLeft: s.timeLeft,
    isPaused: s.isPaused,
    message: s.message,
    usedWords: s.usedWords,
    hints: s.hints,
    isHintMode: s.isHintMode,
    reviewedWords: s.reviewedWords,
    isPreparing: s.isPreparing,
    prepTimeLeft: s.prepTimeLeft,
    allCards: s.allCards,
    playedStack: s.playedStack,
    selectedPackKey: s.selectedPackKey,
  };
}

/**
 * ?덈꺼 ?곹깭 ?앹꽦 (?쒖닔)
 * @param {string[]} usedWordsBefore - ?댁쟾 ?덈꺼源뚯? ?꾩쟻 ?ъ슜 ?⑥뼱
 */
function buildLevelBundle(targetLevel, members, packKey, usedWordsBefore, keepUsedWords) {
  const totalPlayers = members.length;
  if (totalPlayers < 2 || totalPlayers > 15) return null;

  const cardsPerPlayer = targetLevel;
  const totalCardsNeeded = totalPlayers * cardsPerPlayer;
  const wordPool = PACK_DATA[packKey].words;

  let availableWords = wordPool.filter((w) => !(keepUsedWords && usedWordsBefore.includes(w.word)));
  let usedWordsNext = [...usedWordsBefore];
  if (availableWords.length < totalCardsNeeded) {
    usedWordsNext = [];
    availableWords = wordPool;
  }

  const shuffledDB = shuffleArray(availableWords);
  const selectedWords = shuffledDB.slice(0, totalCardsNeeded);

  if (keepUsedWords) {
    usedWordsNext = [...usedWordsBefore, ...selectedWords.map((w) => w.word)];
  } else {
    usedWordsNext = [...selectedWords.map((w) => w.word)];
  }

  const slotIndices = [];
  for (let p = 0; p < totalPlayers; p++) {
    for (let c = 0; c < cardsPerPlayer; c++) slotIndices.push(p);
  }
  const owners = shuffleArray(slotIndices).map((si) => slotOwner(si));

  const sortedWords = [...selectedWords].sort((a, b) => a.word.localeCompare(b.word, 'ko'));
  const currentLevelTime = getLevelTime(targetLevel);

  const allCards = selectedWords.map((item, idx) => {
    const rank = sortedWords.findIndex((sw) => sw.word === item.word);
    const targetTime = currentLevelTime - (currentLevelTime / (totalCardsNeeded + 1)) * (rank + 1);
    return {
      id: `${item.word}-${idx}-${targetLevel}`,
      word: item.word,
      desc: item.desc,
      owner: owners[idx],
      rank,
      targetTime,
      status: 'hand',
      revealed: false,
    };
  });

  return {
    allCards,
    playedStack: [],
    level: targetLevel,
    timeLeft: currentLevelTime,
    usedWords: usedWordsNext,
    isPreparing: true,
    prepTimeLeft: 5,
    gameState: 'playing',
  };
}

/**
 * 移⑤У??媛?섎떎 ??2~15紐??щ’, ?⑤씪?????몄뒪?멸? Firestore ?숆린??
 */
export function useSilentDictionaryGame() {
  const [gameState, setGameState] = useState('home');
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

  /** @type {{ playerId: string, name: string, isAI: boolean }[]} */
  const [sessionMembers, setSessionMembers] = useState([]);
  const [mySlotIndex, setMySlotIndex] = useState(0);
  const sessionMembersRef = useRef(sessionMembers);

  useEffect(() => {
    sessionMembersRef.current = sessionMembers;
  }, [sessionMembers]);

  /** 온라인 세션 (effect 재실행용) */
  const [netRoom, setNetRoom] = useState(null);
  const networkRef = useRef({
    db: null,
    roomId: null,
    isHost: true,
    playerId: '',
    hostPlayerId: '',
  });

  const syncNetRef = useCallback((nr) => {
    if (!nr) {
      networkRef.current = {
        db: null,
        roomId: null,
        isHost: true,
        playerId: networkRef.current.playerId,
        hostPlayerId: networkRef.current.hostPlayerId,
      };
      setNetRoom(null);
      return;
    }
    networkRef.current = {
      db: nr.db,
      roomId: nr.roomId,
      isHost: nr.isHost,
      playerId: nr.playerId ?? networkRef.current.playerId,
      hostPlayerId: nr.hostPlayerId ?? networkRef.current.hostPlayerId,
    };
    setNetRoom(nr);
  }, []);

  const hydrateFromGame = useCallback((g) => {
    if (!g || g.v !== 1) return;
    setGameState(g.gameState);
    setLevel(g.level);
    setLives(g.lives);
    setTimeLeft(g.timeLeft);
    setIsPaused(g.isPaused);
    setMessage(g.message ?? '');
    setUsedWords(g.usedWords ?? []);
    setHints(g.hints ?? 2);
    setIsHintMode(g.isHintMode ?? false);
    setReviewedWords(g.reviewedWords ?? []);
    setIsPreparing(g.isPreparing ?? false);
    setPrepTimeLeft(g.prepTimeLeft ?? 5);
    setAllCards(g.allCards ?? []);
    setPlayedStack(g.playedStack ?? []);
    if (g.selectedPackKey) setSelectedPackKey(g.selectedPackKey);
  }, []);

  const applyLevelBundle = useCallback((bundle) => {
    if (!bundle) return;
    setAllCards(bundle.allCards);
    setPlayedStack(bundle.playedStack);
    setLevel(bundle.level);
    setTimeLeft(bundle.timeLeft);
    setUsedWords(bundle.usedWords);
    setIsPreparing(bundle.isPreparing);
    setPrepTimeLeft(bundle.prepTimeLeft);
    setGameState(bundle.gameState);
    setIsPaused(false);
    setIsHintMode(false);
    setReviewedWords([]);
    setMessage('');
  }, []);

  const startLevel = useCallback(
    (targetLevel, keepUsedWords = true, membersArg) => {
      const members = membersArg ?? sessionMembersRef.current;
      const bundle = buildLevelBundle(targetLevel, members, selectedPackKey, usedWords, keepUsedWords);
      if (!bundle) return;
      applyLevelBundle(bundle);
    },
    [selectedPackKey, usedWords, applyLevelBundle]
  );

  /** ?⑤씪???몄뒪?? 諛⑹뿉 寃뚯엫 ?쒖옉 而ㅻ컠 */
  const beginOnlineHostGame = useCallback(
    async ({ db, roomId, members, mySlot, packKey, hostPlayerId, playerId }) => {
      syncNetRef({ db, roomId, isHost: true, hostPlayerId, playerId });
      setSessionMembers(members);
      setMySlotIndex(mySlot);
      setSelectedPackKey(packKey);
      setLives(3);
      setHints(2);
      setUsedWords([]);
      const bundle = buildLevelBundle(1, members, packKey, [], false);
      if (!bundle) return;
      setAllCards(bundle.allCards);
      setPlayedStack(bundle.playedStack);
      setLevel(bundle.level);
      setTimeLeft(bundle.timeLeft);
      setUsedWords(bundle.usedWords);
      setIsPreparing(bundle.isPreparing);
      setPrepTimeLeft(bundle.prepTimeLeft);
      setGameState('playing');
      setIsPaused(false);
      setIsHintMode(false);
      setReviewedWords([]);
      setMessage('');

      const snapshot = serializeGame({
        gameState: 'playing',
        level: 1,
        lives: 3,
        timeLeft: bundle.timeLeft,
        isPaused: false,
        message: '',
        usedWords: bundle.usedWords,
        hints: 2,
        isHintMode: false,
        reviewedWords: [],
        isPreparing: bundle.isPreparing,
        prepTimeLeft: bundle.prepTimeLeft,
        allCards: bundle.allCards,
        playedStack: bundle.playedStack,
        selectedPackKey: packKey,
      });
      await startRoomGame(db, roomId, hostPlayerId, snapshot);
    },
    [syncNetRef]
  );

  /** ?⑤씪??寃뚯뒪?? ?ㅻ깄?룸쭔 ?섏떊 */
  const joinOnlineAsGuest = useCallback(
    ({ db, roomId, members, mySlot, playerId, hostPlayerId }) => {
      syncNetRef({ db, roomId, isHost: false, hostPlayerId, playerId });
      setSessionMembers(members);
      setMySlotIndex(mySlot);
    },
    [syncNetRef]
  );

  /** ?ㅽ봽?쇱씤 濡쒕퉬?먯꽌 寃뚯엫 ?쒖옉 */
  const startOfflineFromLobby = useCallback(
    (members, packKey, playerId) => {
      syncNetRef(null);
      networkRef.current.playerId = playerId;
      networkRef.current.hostPlayerId = playerId;
      setSessionMembers(members);
      const idx = members.findIndex((m) => m.playerId === playerId);
      setMySlotIndex(idx >= 0 ? idx : 0);
      setSelectedPackKey(packKey);
      setLives(3);
      setHints(2);
      setUsedWords([]);
      const bundle = buildLevelBundle(1, members, packKey, [], false);
      if (!bundle) return;
      applyLevelBundle(bundle);
    },
    [applyLevelBundle, syncNetRef]
  );

  const setPlayerContext = useCallback((playerId, hostPlayerId) => {
    networkRef.current.playerId = playerId;
    networkRef.current.hostPlayerId = hostPlayerId || playerId;
  }, []);

  const startGame = () => {
    setLives(3);
    setHints(2);
    setUsedWords([]);
    startLevel(1, false);
  };

  const resetToLobby = useCallback(() => {
    syncNetRef(null);
    setGameState('home');
    setSessionMembers([]);
  }, [syncNetRef]);

  const toggleHintMode = () => {
    if (hints > 0 && !isHintMode) {
      setIsHintMode(true);
      setMessage(`[길라잡이]\n원하는 상대의 뒤집힌 카드를 클릭해 엿보세요!`);
    } else if (isHintMode) {
      setIsHintMode(false);
      setMessage('');
    }
  };

  const handleRevealAICard = (cardId) => {
    if (!isHintMode) return;
    setAllCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)));
    setHints((prev) => prev - 1);
    setIsHintMode(false);
    setMessage('');
  };

  const handleMistake = useCallback((wrongCard) => {
    setIsPaused(true);
    setPlayedStack((prev) => [...prev, wrongCard]);

    setAllCards((prev) =>
      prev.map((c) => {
        if (c.id === wrongCard.id) return { ...c, status: 'played' };
        if (c.status === 'hand' && c.rank < wrongCard.rank) {
          setPlayedStack((stack) => [...stack, c]);
          return { ...c, status: 'discarded' };
        }
        return c;
      })
    );

    setLives((prevLives) => {
      const newLives = prevLives - 1;
      if (newLives <= 0) {
        setGameState('game_over');
      } else {
        setMessage(`앗! 누군가 더 앞선 단어를 가지고 있습니다.\n(생명력 -1)`);
        setTimeout(() => {
          setMessage('');
          setIsPaused(false);
        }, 2500);
      }
      return newLives;
    });
  }, []);

  const handlePlayCard = useCallback(
    (cardToPlay) => {
      if (gameState !== 'playing' || isPaused || isPreparing) return;

      const net = networkRef.current;
      if (net.db && net.roomId && !net.isHost) {
        pushPlayAction(net.db, net.roomId, { cardId: cardToPlay.id, slot: mySlotIndex }).catch(console.error);
        return;
      }

      const unplayedCards = allCards.filter((c) => c.status === 'hand');
      if (unplayedCards.length === 0) return;

      const lowestRank = Math.min(...unplayedCards.map((c) => c.rank));

      if (cardToPlay.rank === lowestRank) {
        setAllCards((prev) => prev.map((c) => (c.id === cardToPlay.id ? { ...c, status: 'played' } : c)));
        setPlayedStack((prev) => [...prev, cardToPlay]);

        if (unplayedCards.length === 1) {
          setIsPaused(true);
          if (level % 2 === 0) setHints((h) => h + 1);
          setGameState('level_clear');
        }
      } else {
        handleMistake(cardToPlay);
      }
    },
    [gameState, isPaused, isPreparing, allCards, level, mySlotIndex, handleMistake]
  );

  const applyRemotePlay = useCallback(
    (cardId, fromSlot) => {
      setAllCards((prevCards) => {
        const cardToPlay = prevCards.find((c) => c.id === cardId);
        if (!cardToPlay || parseSlot(cardToPlay.owner) !== fromSlot) return prevCards;

        const unplayedCards = prevCards.filter((c) => c.status === 'hand');
        if (unplayedCards.length === 0) return prevCards;

        const lowestRank = Math.min(...unplayedCards.map((c) => c.rank));

        if (cardToPlay.rank === lowestRank) {
          const next = prevCards.map((c) => (c.id === cardToPlay.id ? { ...c, status: 'played' } : c));
          setPlayedStack((prev) => [...prev, cardToPlay]);
          if (unplayedCards.length === 1) {
            setIsPaused(true);
            if (level % 2 === 0) setHints((h) => h + 1);
            setGameState('level_clear');
          }
          return next;
        }
        setTimeout(() => handleMistake(cardToPlay), 0);
        return prevCards;
      });
    },
    [level, handleMistake]
  );

  const handleTimeout = useCallback(() => {
    setIsPaused(true);
    setLives((prev) => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setGameState('game_over');
      } else {
        setMessage(`시간 초과! 시간이 지났습니다.\n(생명력 -1, 레벨 다시 시작)`);
        setTimeout(() => {
          startLevel(level, false);
        }, 3000);
      }
      return newLives;
    });
  }, [level, startLevel]);

  const checkAiPlays = useCallback(
    (currentTime) => {
      const members = sessionMembersRef.current;
      const aiCardsToPlay = allCards.filter((c) => {
        if (c.status !== 'hand') return false;
        const si = parseSlot(c.owner);
        if (si < 0 || !members[si]) return false;
        if (!members[si].isAI) return false;
        return c.targetTime >= currentTime;
      });
      if (aiCardsToPlay.length > 0) {
        handlePlayCard(aiCardsToPlay[0]);
      }
    },
    [allCards, handlePlayCard]
  );

  useEffect(() => {
    if (gameState !== 'playing' || !isPreparing) return;
    if (prepTimeLeft <= 0) {
      setIsPreparing(false);
      setMessage('시작!');
      setTimeout(() => setMessage(''), 1000);
      return;
    }
    const timer = setTimeout(() => {
      setPrepTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [prepTimeLeft, isPreparing, gameState]);

  const runTimer =
    !netRoom || (netRoom.db && netRoom.roomId && netRoom.isHost);

  useEffect(() => {
    if (!runTimer || gameState !== 'playing' || isPaused || isHintMode || isPreparing) return;

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
  }, [timeLeft, gameState, isPaused, isHintMode, isPreparing, runTimer, checkAiPlays, handleTimeout]);

  /** 鍮꾪샇?ㅽ듃: 諛?寃뚯엫 ?ㅻ깄??*/
  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || netRoom.isHost) return undefined;
    return subscribeRoom(netRoom.db, netRoom.roomId, (room) => {
      if (!room || room.phase !== 'playing' || !room.game) return;
      if (Array.isArray(room.members)) setSessionMembers(room.members);
      hydrateFromGame(room.game);
    });
  }, [netRoom, hydrateFromGame]);

  /** ?몄뒪?? ?먭꺽 ?뚮젅???≪뀡 */
  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost) return undefined;
    return subscribeActions(netRoom.db, netRoom.roomId, async (actionDocId, data) => {
      if (data.type !== 'PLAY_CARD') return;
      const { cardId, slot } = data;
      try {
        await deleteActionDoc(netRoom.db, netRoom.roomId, actionDocId);
      } catch (e) {
        console.error(e);
      }
      if (slot === mySlotIndex) return;
      applyRemotePlay(cardId, slot);
    });
  }, [netRoom, mySlotIndex, applyRemotePlay]);

  const gameBlob = useMemo(
    () =>
      serializeGame({
        gameState,
        level,
        lives,
        timeLeft,
        isPaused,
        message,
        usedWords,
        hints,
        isHintMode,
        reviewedWords,
        isPreparing,
        prepTimeLeft,
        allCards,
        playedStack,
        selectedPackKey,
      }),
    [
      gameState,
      level,
      lives,
      timeLeft,
      isPaused,
      message,
      usedWords,
      hints,
      isHintMode,
      reviewedWords,
      isPreparing,
      prepTimeLeft,
      allCards,
      playedStack,
      selectedPackKey,
    ]
  );

  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost || gameState === 'home') return undefined;
    const t = setTimeout(() => {
      updateRoomGame(netRoom.db, netRoom.roomId, netRoom.hostPlayerId, gameBlob).catch(console.error);
    }, 400);
    return () => clearTimeout(t);
  }, [gameBlob, gameState, netRoom]);

  const userHand = allCards
    .filter((c) => c.owner === slotOwner(mySlotIndex) && c.status === 'hand')
    .sort((a, b) => a.rank - b.rank);

  const opponentSlots = sessionMembers
    .map((m, i) => ({ ...m, slotIndex: i }))
    .filter((_, i) => i !== mySlotIndex);

  const cardsBySlot = useCallback(
    (slotIdx) => allCards.filter((c) => c.owner === slotOwner(slotIdx) && c.status === 'hand'),
    [allCards]
  );

  const lastPlayed = playedStack.length > 0 ? playedStack[playedStack.length - 1] : null;
  const sortedPlayedStack = [...playedStack].sort((a, b) => a.rank - b.rank);

  const getOwnerLabel = useCallback(
    (ownerStr) => {
      const i = parseSlot(ownerStr);
      const m = sessionMembers[i];
      if (!m) return '?';
      if (i === mySlotIndex) return '나';
      return m.isAI ? `🤖 ${m.name}` : m.name;
    },
    [sessionMembers, mySlotIndex]
  );

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
    sessionMembers,
    mySlotIndex,
    opponentSlots,
    cardsBySlot,
    getOwnerLabel,
    getLevelTime,
    startLevel,
    startGame,
    beginOnlineHostGame,
    joinOnlineAsGuest,
    startOfflineFromLobby,
    setPlayerContext,
    resetToLobby,
    toggleHintMode,
    handleRevealAICard,
    handlePlayCard,
    userHand,
    lastPlayed,
    sortedPlayedStack,
    netRoom,
  };
}
