import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PACK_DATA } from '../data/words.js';
import { shuffleArray, getLevelTime, assignDictionaryRanks, dedupeWordEntriesByWord } from '../utils/helpers.js';
import { hangulChoseongIndex } from '../utils/wordPick.js';
import {
  startRoomGame,
  updateRoomGame,
  subscribeRoom,
  subscribeActions,
  deleteActionDoc,
  pushPlayAction,
  pushPrepReorderAction,
  returnRoomToLobby,
  playerSelfLeaveRoom,
  ROOM_MAX,
} from '../lib/roomService.js';

const DEFAULT_PACK_KEY = 'grade6';

function resolvePack(packKey) {
  const p = PACK_DATA[packKey];
  if (p?.words?.length) return { key: packKey, pack: p };
  return { key: DEFAULT_PACK_KEY, pack: PACK_DATA[DEFAULT_PACK_KEY] };
}

const TOTAL_LEVELS = 15;

export { TOTAL_LEVELS };

function slotOwner(i) {
  return `s${i}`;
}

function parseSlot(owner) {
  const n = parseInt(String(owner).replace(/^s/, ''), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * AI가 이번에 내야 할 선두(사전 순 최우선) 카드를 쥐었을 때의 제출 지연(초).
 * 초성(ㄱ~ㅎ)에 따라 약간만 차등하고, 예전보다 훨씬 짧게 망설여 먼저 내기 쉽게 함.
 */
function aiPlayDelayLeadCard(remainingSec, choseongIdx) {
  const g =
    Number.isFinite(choseongIdx) && choseongIdx >= 0 && choseongIdx <= 18 ? choseongIdx : 9;
  const t = Math.max(0.05, remainingSec);
  const frac = 0.05 + (0.29 * (g + 1)) / 19;
  return Math.min(t * frac, 2.5, t * 0.42);
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
    /** 슬롯별 손패 표시 순서(카드 id 배열, 랜덤 지급·준비 시간 정렬용) */
    handDisplayOrder: s.handDisplayOrder ?? {},
  };
}

/**
 * 레벨 묶음 생성 — 단어는 레벨마다 완전 무작위(초성 패턴 없음).
 * 세션에서 아직 안 나온 단어를 우선 소진한 뒤, 풀 전체를 다시 섞어 이어감(전체 플레이 중 모든 단어가 최소 1회 등장하도록).
 * @param {string[]} usedWordsBefore - 이전 레벨까지 누적 사용된 단어(단어 문자열)
 */
function buildLevelBundle(targetLevel, members, packKey, usedWordsBefore, keepUsedWords) {
  const totalPlayers = members.length;
  if (totalPlayers < 2 || totalPlayers > ROOM_MAX) return null;

  const cardsPerPlayer = targetLevel;
  const totalCardsNeeded = totalPlayers * cardsPerPlayer;
  const { pack } = resolvePack(packKey);
  const wordPool = dedupeWordEntriesByWord(
    (pack.words || []).filter((w) => w && typeof w.word === 'string' && w.word.length > 0)
  );
  /* 한 레벨에서 서로 다른 카드가 필요하므로 풀 크기가 부족하면 불가 */
  if (wordPool.length < totalCardsNeeded) return null;

  const usedSet = new Set(keepUsedWords && Array.isArray(usedWordsBefore) ? usedWordsBefore : []);
  const unseen = wordPool.filter((w) => !usedSet.has(w.word));
  let pickedFromFullPoolCycle = false;
  let selectedWords = [];

  if (unseen.length >= totalCardsNeeded) {
    selectedWords = shuffleArray(unseen).slice(0, totalCardsNeeded);
  } else if (unseen.length > 0) {
    const shU = shuffleArray(unseen);
    const needMore = totalCardsNeeded - shU.length;
    const seenOnly = wordPool.filter((w) => usedSet.has(w.word));
    const shS = shuffleArray(seenOnly);
    selectedWords = [...shU, ...shS.slice(0, needMore)];
  } else {
    /* 한 번씩 모두 등장 완료 → 풀 전체에서 무작위로 다음 레벨 구성 */
    pickedFromFullPoolCycle = keepUsedWords && usedSet.size > 0;
    selectedWords = shuffleArray([...wordPool]).slice(0, totalCardsNeeded);
  }

  /* 동일 단어가 같은 레벨에서 두 번 나오지 않도록 보장 */
  const seenW = new Set();
  const uniquePick = [];
  for (const w of selectedWords) {
    if (!w || typeof w.word !== 'string') continue;
    if (seenW.has(w.word)) continue;
    seenW.add(w.word);
    uniquePick.push(w);
  }
  if (uniquePick.length < totalCardsNeeded) {
    const rest = shuffleArray(wordPool.filter((w) => w && typeof w.word === 'string' && !seenW.has(w.word)));
    for (const w of rest) {
      if (uniquePick.length >= totalCardsNeeded) break;
      seenW.add(w.word);
      uniquePick.push(w);
    }
  }
  if (uniquePick.length < totalCardsNeeded) return null;

  selectedWords = uniquePick;

  let usedWordsNext;
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

  /* 사전 가나다순 고유 순위 (동일 단어 중복·findIndex(-1) 오류 방지) */
  const ranks = assignDictionaryRanks(selectedWords);
  const currentLevelTime = getLevelTime(targetLevel);

  const allCards = selectedWords.map((item, idx) => {
    const rank = ranks[idx];
    const targetTime = currentLevelTime - (currentLevelTime / (totalCardsNeeded + 1)) * (rank + 1);
    return {
      /* 단어·슬롯·인덱스 조합으로 전역 유일성 강화 */
      id: `c-${targetLevel}-${idx}-${owners[idx]}-r${rank}-${item.word}`,
      word: item.word,
      desc: item.desc,
      owner: owners[idx],
      rank,
      targetTime,
      status: 'hand',
      revealed: false,
    };
  });

  /* 슬롯마다 손패를 사전순이 아닌 무작위 순서로 표시 */
  const handDisplayOrder = {};
  for (let si = 0; si < totalPlayers; si++) {
    const own = slotOwner(si);
    const ids = allCards.filter((c) => c.owner === own).map((c) => c.id);
    handDisplayOrder[own] = shuffleArray([...ids]);
  }

  return {
    allCards,
    handDisplayOrder,
    playedStack: [],
    level: targetLevel,
    timeLeft: currentLevelTime,
    usedWords: usedWordsNext,
    isPreparing: true,
    prepTimeLeft: 5,
    gameState: 'playing',
    /** 풀의 모든 단어를 한 번씩 쓴 뒤 다시 무작위로 뽑기 시작한 레벨 */
    exhaustionCycle: pickedFromFullPoolCycle,
  };
}

/**
 * 침묵의 사전 게임 훅 (2~15명, 온라인 시 Firestore 동기화)
 * @param {{ onReturnedToLobby?: () => void }} [options] — 방이 로비로 돌아올 때(호스트 복귀·스냅샷) 상위에서 phase 전환 등
 */
export function useSilentDictionaryGame(options = {}) {
  const { onReturnedToLobby } = options;
  const onReturnedToLobbyRef = useRef(onReturnedToLobby);
  useEffect(() => {
    onReturnedToLobbyRef.current = onReturnedToLobby;
  }, [onReturnedToLobby]);
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
  /** @type {Record<string, string[]>} 슬롯(owner 키)별 손패 카드 id 표시 순서 */
  const [handDisplayOrder, setHandDisplayOrder] = useState({});
  const allCardsRef = useRef([]);
  /** 실수로 판이 끝난 뒤 같은 레벨 재시작을 이미 걸었는지(중복 방지) */
  const failedRoundRecoveryRef = useRef(false);
  /** 사람(비 AI)이 카드를 제출한 직후 AI가 최소 2초 대기 (절대 시각 ms) */
  const aiCooldownAfterHumanUntilRef = useRef(0);
  /** 손패가 한 장만 남았을 때 AI 제출 시각(targetTime 무시, 남은 시간 내 랜덤) */
  const aiLastCardPlayAtRef = useRef(0);
  /** AI 다음 제출 벽시각(ms). 학생 패를 모른다고 가정해 전역 targetTime 대신 초성·남은 시간으로만 스케줄 */
  const aiPlayAtWallRef = useRef(0);
  const aiPlayScheduledCardIdRef = useRef('');
  const [playedStack, setPlayedStack] = useState([]);

  /** @type {{ playerId: string, name: string, isAI: boolean }[]} */
  const [sessionMembers, setSessionMembers] = useState([]);
  const [mySlotIndex, setMySlotIndex] = useState(0);
  /** 백그라운드 탭에서 타이머가 멈추면 크롬 절전·간섭 메시지 완화 */
  const [docHidden, setDocHidden] = useState(
    () => (typeof document !== 'undefined' ? document.hidden : false)
  );
  /** 온라인 세션 (effect 재실행용) */
  const [netRoom, setNetRoom] = useState(null);
  const sessionMembersRef = useRef(sessionMembers);
  const livesRef = useRef(lives);

  useEffect(() => {
    sessionMembersRef.current = sessionMembers;
  }, [sessionMembers]);

  useEffect(() => {
    livesRef.current = lives;
  }, [lives]);

  useEffect(() => {
    allCardsRef.current = allCards;
  }, [allCards]);

  useEffect(() => {
    const fn = () => setDocHidden(document.hidden);
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);

  const networkRef = useRef({
    db: null,
    roomId: null,
    isHost: true,
    playerId: '',
    hostPlayerId: '',
  });

  /** 게스트: 동일 game 스냅샷 반복 적용으로 인한 렌더·지연 루프 방지 */
  const lastHydratedGameJsonRef = useRef('');
  /** 호스트: Firestore에 동일 페이로드 연속 쓰기 방지 */
  const lastNetworkWriteJsonRef = useRef('');
  /** 게스트: 제출 직후~스냅샷 수신 전까지 중복 클릭 방지 */
  const [guestPlayLocked, setGuestPlayLocked] = useState(false);
  /** 호스트: 원격 PLAY_CARD로 이미 처리한 카드 id(중복 액션·이중 실수 방지) */
  const appliedRemoteCardIdsRef = useRef(new Set());

  const syncNetRef = useCallback((nr) => {
    if (!nr) {
      networkRef.current = {
        db: null,
        roomId: null,
        isHost: true,
        playerId: networkRef.current.playerId,
        hostPlayerId: networkRef.current.hostPlayerId,
      };
      lastHydratedGameJsonRef.current = '';
      lastNetworkWriteJsonRef.current = '';
      appliedRemoteCardIdsRef.current.clear();
      setGuestPlayLocked(false);
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
    let snapshotJson;
    try {
      snapshotJson = JSON.stringify(g);
    } catch {
      return;
    }
    if (snapshotJson === lastHydratedGameJsonRef.current) return;
    lastHydratedGameJsonRef.current = snapshotJson;
    try {
      const safeLevel = Math.min(
        TOTAL_LEVELS,
        Math.max(1, Number.isFinite(Number(g.level)) ? Math.floor(Number(g.level)) : 1)
      );
      const safeLives = Math.min(
        99,
        Math.max(0, Number.isFinite(Number(g.lives)) ? Math.floor(Number(g.lives)) : 3)
      );
      const safeTime = Number.isFinite(Number(g.timeLeft)) ? Number(g.timeLeft) : 20;

      const rawCards = Array.isArray(g.allCards) ? g.allCards : [];
      const safeCards = rawCards.map((c, i) => {
        if (!c || typeof c !== 'object') return null;
        const status = c.status === 'played' || c.status === 'discarded' ? c.status : 'hand';
        return {
          id: String(c.id ?? `card-${i}`),
          word: typeof c.word === 'string' ? c.word : '?',
          desc: typeof c.desc === 'string' ? c.desc : '',
          owner: typeof c.owner === 'string' ? c.owner : 's0',
          rank: Number.isFinite(Number(c.rank)) ? Number(c.rank) : i,
          targetTime: Number.isFinite(Number(c.targetTime)) ? Number(c.targetTime) : 0,
          status,
          revealed: Boolean(c.revealed),
        };
      }).filter(Boolean);

      const rawStack = Array.isArray(g.playedStack) ? g.playedStack : [];
      const seenPlayIds = new Set();
      const safeStack = rawStack
        .map((c, i) => {
          if (!c || typeof c !== 'object') return null;
          return {
            id: String(c.id ?? `p-${i}`),
            word: typeof c.word === 'string' ? c.word : '?',
            desc: typeof c.desc === 'string' ? c.desc : '',
            owner: typeof c.owner === 'string' ? c.owner : 's0',
            rank: Number.isFinite(Number(c.rank)) ? Number(c.rank) : i,
            targetTime: Number.isFinite(Number(c.targetTime)) ? Number(c.targetTime) : 0,
            status: 'played',
            revealed: Boolean(c.revealed),
          };
        })
        .filter(Boolean)
        .filter((c) => {
          if (seenPlayIds.has(c.id)) return false;
          seenPlayIds.add(c.id);
          return true;
        });

      const pk =
        g.selectedPackKey && PACK_DATA[g.selectedPackKey] ? g.selectedPackKey : DEFAULT_PACK_KEY;

      setGameState(typeof g.gameState === 'string' ? g.gameState : 'playing');
      setLevel(safeLevel);
      setLives(safeLives);
      setTimeLeft(safeTime);
      setIsPaused(Boolean(g.isPaused));
      setMessage(typeof g.message === 'string' ? g.message : '');
      setUsedWords(Array.isArray(g.usedWords) ? g.usedWords : []);
      setHints(Math.min(99, Math.max(0, Number.isFinite(Number(g.hints)) ? Math.floor(Number(g.hints)) : 2)));
      setIsHintMode(Boolean(g.isHintMode));
      setReviewedWords(Array.isArray(g.reviewedWords) ? g.reviewedWords : []);
      setIsPreparing(Boolean(g.isPreparing));
      setPrepTimeLeft(
        Math.min(60, Math.max(0, Number.isFinite(Number(g.prepTimeLeft)) ? Math.floor(Number(g.prepTimeLeft)) : 5))
      );
      setAllCards(safeCards);
      setPlayedStack(safeStack);
      setSelectedPackKey(pk);

      const rawHo = g.handDisplayOrder;
      if (rawHo && typeof rawHo === 'object' && !Array.isArray(rawHo)) {
        const ho = {};
        for (const k of Object.keys(rawHo)) {
          if (Array.isArray(rawHo[k])) ho[k] = rawHo[k].map((id) => String(id));
        }
        setHandDisplayOrder(ho);
      } else {
        const fallbackHo = {};
        for (let si = 0; si < ROOM_MAX; si++) {
          const key = slotOwner(si);
          const ids = safeCards
            .filter((c) => c.owner === key && c.status === 'hand')
            .sort((a, b) => a.rank - b.rank)
            .map((c) => c.id);
          if (ids.length) fallbackHo[key] = ids;
        }
        setHandDisplayOrder(fallbackHo);
      }
      if (!networkRef.current.isHost) {
        setGuestPlayLocked(false);
      }
    } catch (e) {
      console.error('[hydrateFromGame]', e);
    }
  }, []);

  const applyLevelBundle = useCallback((bundle) => {
    if (!bundle) return;
    failedRoundRecoveryRef.current = false;
    appliedRemoteCardIdsRef.current.clear();
    aiCooldownAfterHumanUntilRef.current = 0;
    aiLastCardPlayAtRef.current = 0;
    aiPlayAtWallRef.current = 0;
    aiPlayScheduledCardIdRef.current = '';
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
    setHandDisplayOrder(bundle.handDisplayOrder ?? {});
  }, []);

  const startLevel = useCallback(
    (targetLevel, keepUsedWords = true, membersArg, usedWordsOverride) => {
      const members = membersArg ?? sessionMembersRef.current;
      const uw = usedWordsOverride !== undefined ? usedWordsOverride : usedWords;
      const bundle = buildLevelBundle(targetLevel, members, selectedPackKey, uw, keepUsedWords);
      if (!bundle) {
        setMessage('단어를 구성할 수 없습니다. 참가 인원(2~15명)과 난이도를 확인해 주세요.');
        return;
      }
      applyLevelBundle(bundle);
      if (bundle.exhaustionCycle) {
        setMessage('모든 단어를 한 번씩 썼습니다. 이제부터는 무작위로 이어갑니다.');
      }
    },
    [selectedPackKey, usedWords, applyLevelBundle]
  );

  /**
   * 실수 처리 후 손패가 비고 폐기(discarded)가 있으면 이미 생명은 깎였음.
   * 시간 초과로 이중 차감·빈 손으로 클리어 오인을 막고 같은 레벨만 다시 섞음.
   */
  const restartLevelAfterFailedRound = useCallback(() => {
    if (failedRoundRecoveryRef.current) return;
    failedRoundRecoveryRef.current = true;
    setIsPaused(true);
    setMessage(
      '순서 실수로 이번 판이 끝났습니다. 같은 레벨을 다시 시작합니다. (추가 생명력 차감 없음)'
    );
    setTimeout(() => {
      setMessage('');
      startLevel(level, true);
    }, 2000);
  }, [level, startLevel]);

  /* 실수로 손패가 비고 폐기만 남음: 생명이 남았으면 레벨 클리어, 없으면 같은 레벨 재시작 */
  useEffect(() => {
    if (gameState !== 'playing' || isPreparing) return;
    const cards = allCards;
    if (cards.length === 0) return;
    const unplayed = cards.filter((c) => c.status === 'hand');
    const hasDiscarded = cards.some((c) => c.status === 'discarded');
    if (unplayed.length !== 0 || !hasDiscarded) return;
    if (failedRoundRecoveryRef.current) return;
    if (livesRef.current > 0) {
      failedRoundRecoveryRef.current = true;
      setIsPaused(true);
      setGameState('level_clear');
      return;
    }
    restartLevelAfterFailedRound();
  }, [allCards, gameState, isPreparing, restartLevelAfterFailedRound]);

  /** ?⑤씪???몄뒪?? 諛⑹뿉 寃뚯엫 ?쒖옉 而ㅻ컠 */
  const beginOnlineHostGame = useCallback(
    async ({ db, roomId, members, mySlot, packKey, hostPlayerId, playerId }) => {
      lastNetworkWriteJsonRef.current = '';
      failedRoundRecoveryRef.current = false;
      appliedRemoteCardIdsRef.current.clear();
      setGuestPlayLocked(false);
      aiCooldownAfterHumanUntilRef.current = 0;
      aiLastCardPlayAtRef.current = 0;
      aiPlayAtWallRef.current = 0;
      aiPlayScheduledCardIdRef.current = '';
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
      setHandDisplayOrder(bundle.handDisplayOrder ?? {});
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
        handDisplayOrder: bundle.handDisplayOrder ?? {},
      });
      await startRoomGame(db, roomId, hostPlayerId, snapshot);
    },
    [syncNetRef]
  );

  /** ?⑤씪??寃뚯뒪?? ?ㅻ깄?룸쭔 ?섏떊 */
  const joinOnlineAsGuest = useCallback(
    ({ db, roomId, members, mySlot, playerId, hostPlayerId }) => {
      lastHydratedGameJsonRef.current = '';
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
    /* setUsedWords 비동기 반영 전에 빈 목록으로 섞어 뽑기 */
    startLevel(1, false, undefined, []);
  };

  /** 로비로 나가기·스냅샷 복귀 시 로컬 판 상태 초기화 */
  const resetToLobby = useCallback(() => {
    lastHydratedGameJsonRef.current = '';
    lastNetworkWriteJsonRef.current = '';
    failedRoundRecoveryRef.current = false;
    appliedRemoteCardIdsRef.current.clear();
    setGuestPlayLocked(false);
    aiCooldownAfterHumanUntilRef.current = 0;
    aiLastCardPlayAtRef.current = 0;
    aiPlayAtWallRef.current = 0;
    aiPlayScheduledCardIdRef.current = '';
    syncNetRef(null);
    setGameState('home');
    setSessionMembers([]);
    setAllCards([]);
    setPlayedStack([]);
    setMessage('');
    setLevel(1);
    setLives(3);
    setTimeLeft(20);
    setIsPaused(false);
    setUsedWords([]);
    setHints(2);
    setIsHintMode(false);
    setReviewedWords([]);
    setIsPreparing(false);
    setPrepTimeLeft(5);
    setHandDisplayOrder({});
  }, [syncNetRef]);

  /** 온라인: Firestore에 로비 반영 후 로컬 초기화 (로비 버튼·결과 화면) */
  const performLeaveOnline = useCallback(async () => {
    const net = networkRef.current;
    if (!net.db || !net.roomId) {
      resetToLobby();
      return;
    }
    try {
      if (net.isHost) {
        await returnRoomToLobby(net.db, net.roomId, net.hostPlayerId);
      } else {
        await playerSelfLeaveRoom(net.db, net.roomId, net.playerId);
      }
    } catch (e) {
      console.error('[performLeaveOnline]', e);
    }
    resetToLobby();
  }, [resetToLobby]);

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
    const prev = allCardsRef.current;
    const stillInHand = prev.find((c) => c.id === wrongCard.id);
    if (!stillInHand || stillInHand.status !== 'hand') return;

    setIsPaused(true);
    const toDiscard = prev.filter((c) => c.status === 'hand' && c.rank < wrongCard.rank);
    /* 앞서 내야 했는데 밀린 카드 장수만큼 생명력 차감(최소 1) */
    const penalty = Math.max(1, toDiscard.length);
    const sortedDisc = [...toDiscard].sort((a, b) => a.rank - b.rank);

    setPlayedStack((stack) => {
      if (stack.some((c) => c.id === wrongCard.id)) return stack;
      return [...stack, wrongCard, ...sortedDisc];
    });
    setAllCards((p) =>
      p.map((c) => {
        if (c.id === wrongCard.id) return { ...c, status: 'played' };
        if (c.status === 'hand' && c.rank < wrongCard.rank) return { ...c, status: 'discarded' };
        return c;
      })
    );

    const removedIds = new Set([wrongCard.id, ...toDiscard.map((c) => c.id)]);
    setHandDisplayOrder((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        next[k] = next[k].filter((id) => !removedIds.has(id));
      }
      return next;
    });

    setLives((prevLives) => {
      const newLives = prevLives - penalty;
      if (newLives <= 0) {
        setGameState('game_over');
      } else {
        setMessage(
          `앗! 순서가 맞지 않습니다.\n앞서 내야 할 카드 ${toDiscard.length}장 — 생명력 -${penalty}`
        );
        setTimeout(() => {
          setMessage('');
          const hands = allCardsRef.current.filter((c) => c.status === 'hand');
          if (hands.length === 0) {
            setIsPaused(true);
            return;
          }
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
        if (guestPlayLocked) return;
        setGuestPlayLocked(true);
        pushPlayAction(net.db, net.roomId, { cardId: cardToPlay.id, slot: mySlotIndex }).catch((e) => {
          console.error(e);
          setGuestPlayLocked(false);
        });
        return;
      }

      const unplayedCards = allCards.filter((c) => c.status === 'hand');
      if (unplayedCards.length === 0) return;

      const ranks = unplayedCards.map((c) => c.rank).filter((r) => Number.isFinite(r));
      if (ranks.length === 0) return;
      const lowestRank = Math.min(...ranks);

      if (cardToPlay.rank === lowestRank) {
        const siPlay = parseSlot(cardToPlay.owner);
        const mem = sessionMembersRef.current[siPlay];
        if (mem && !mem.isAI) {
          aiCooldownAfterHumanUntilRef.current = Date.now() + 2000;
          aiPlayScheduledCardIdRef.current = '';
          aiPlayAtWallRef.current = 0;
        }
        setAllCards((prev) => prev.map((c) => (c.id === cardToPlay.id ? { ...c, status: 'played' } : c)));
        setHandDisplayOrder((prevHo) => {
          const k = slotOwner(parseSlot(cardToPlay.owner));
          const arr = prevHo[k];
          if (!arr) return prevHo;
          return { ...prevHo, [k]: arr.filter((id) => id !== cardToPlay.id) };
        });
        setPlayedStack((prev) => {
          if (prev.some((c) => c.id === cardToPlay.id)) return prev;
          return [...prev, cardToPlay];
        });

        if (unplayedCards.length === 1) {
          setIsPaused(true);
          if (level % 3 === 0) setHints((h) => h + 1);
          setGameState('level_clear');
        }
      } else {
        handleMistake(cardToPlay);
      }
    },
    [gameState, isPaused, isPreparing, allCards, level, mySlotIndex, handleMistake, guestPlayLocked]
  );

  /**
   * 호스트만: 다른 슬롯에서 원격으로 낸 카드 반영(멱등 — 동일 카드 id 중복 처리 방지)
   */
  const applyRemotePlay = useCallback(
    (cardId, fromSlot) => {
      const id = String(cardId);
      if (appliedRemoteCardIdsRef.current.has(id)) return;

      const prevCards = allCardsRef.current;
      const cardToPlay = prevCards.find((c) => c.id === id);
      if (!cardToPlay || parseSlot(cardToPlay.owner) !== fromSlot) return;
      if (cardToPlay.status !== 'hand') return;

      const unplayedCards = prevCards.filter((c) => c.status === 'hand');
      if (unplayedCards.length === 0) return;

      const ranks = unplayedCards.map((c) => c.rank).filter((r) => Number.isFinite(r));
      if (ranks.length === 0) return;
      const lowestRank = Math.min(...ranks);

      if (cardToPlay.rank === lowestRank) {
        appliedRemoteCardIdsRef.current.add(id);
        const m = sessionMembersRef.current[fromSlot];
        if (m && !m.isAI) {
          aiCooldownAfterHumanUntilRef.current = Date.now() + 2000;
          aiPlayScheduledCardIdRef.current = '';
          aiPlayAtWallRef.current = 0;
        }
        setAllCards((prev) => prev.map((c) => (c.id === id ? { ...c, status: 'played' } : c)));
        setHandDisplayOrder((prevHo) => {
          const k = slotOwner(fromSlot);
          const arr = prevHo[k];
          if (!arr) return prevHo;
          return { ...prevHo, [k]: arr.filter((cid) => cid !== id) };
        });
        setPlayedStack((prev) => {
          if (prev.some((c) => c.id === id)) return prev;
          return [...prev, cardToPlay];
        });
        if (unplayedCards.length === 1) {
          setIsPaused(true);
          if (level % 3 === 0) setHints((h) => h + 1);
          setGameState('level_clear');
        }
        return;
      }

      const live = allCardsRef.current.find((c) => c.id === id);
      if (!live || live.status !== 'hand') return;
      appliedRemoteCardIdsRef.current.add(id);
      handleMistake(cardToPlay);
    },
    [level, handleMistake]
  );

  const handleTimeout = useCallback(() => {
    const cards = allCardsRef.current;
    const unplayed = cards.filter((c) => c.status === 'hand');
    const hasDiscarded = cards.some((c) => c.status === 'discarded');

    /* 마지막 한 장이 AI 차례인데 제한시간만 다한 경우: 랜덤 지연·타임아웃 레이스로 생명만 깎이지 않도록 즉시 제출 */
    if (unplayed.length === 1) {
      const ranks = unplayed.map((c) => c.rank).filter((r) => Number.isFinite(r));
      if (ranks.length > 0) {
        const lowestRank = Math.min(...ranks);
        const cardToPlay = unplayed.find((c) => c.rank === lowestRank);
        const si = cardToPlay ? parseSlot(cardToPlay.owner) : -1;
        const members = sessionMembersRef.current;
        if (cardToPlay && si >= 0 && members[si]?.isAI) {
          aiLastCardPlayAtRef.current = 0;
          handlePlayCard(cardToPlay);
          return;
        }
      }
    }

    /* 실수 후 손패 없음: 타임아웃으로 이중 차감 방지 */
    if (unplayed.length === 0 && cards.length > 0) {
      if (hasDiscarded) {
        if (failedRoundRecoveryRef.current) return;
        if (livesRef.current > 0) {
          failedRoundRecoveryRef.current = true;
          setIsPaused(true);
          setGameState('level_clear');
        } else {
          restartLevelAfterFailedRound();
        }
        return;
      }
      setIsPaused(true);
      setGameState((g) => (g === 'playing' ? 'level_clear' : g));
      return;
    }

    setIsPaused(true);
    setLives((prev) => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setGameState('game_over');
      } else {
        setMessage(
          `시간 초과로 생명력이 1 줄었습니다.\n\n【이유】사전 순서상 이번에 가장 먼저 내야 할 카드를 제한 시간이 끝나기 전에 아무도 내지 못했습니다. 차례를 놓치면 레벨을 완주할 수 없습니다.\n\n(이 레벨을 처음부터 다시 시작합니다)`
        );
        setTimeout(() => {
          /* 같은 판 재도전: 이전 레벨에서 쓴 단어는 제외한 채 새로 뽑음 */
          startLevel(level, true);
        }, 3000);
      }
      return newLives;
    });
  }, [level, startLevel, restartLevelAfterFailedRound, handlePlayCard]);

  const checkAiPlays = useCallback(
    (currentTime) => {
      const members = sessionMembersRef.current;
      const unplayedCards = allCards.filter((c) => c.status === 'hand');
      if (unplayedCards.length === 0) return;

      if (unplayedCards.length !== 1) {
        aiLastCardPlayAtRef.current = 0;
      } else {
        aiPlayScheduledCardIdRef.current = '';
        aiPlayAtWallRef.current = 0;
      }
      if (Date.now() < aiCooldownAfterHumanUntilRef.current) return;

      const ranks = unplayedCards.map((c) => c.rank).filter((r) => Number.isFinite(r));
      if (ranks.length === 0) return;
      const lowestRank = Math.min(...ranks);
      const cardToPlay = unplayedCards.find((c) => c.rank === lowestRank);
      if (!cardToPlay) return;

      const si = parseSlot(cardToPlay.owner);
      if (si < 0 || !members[si] || members[si].isAI !== true) return;

      /* 마지막 한 장: 남은 시간 끝나기 전에 반드시 제출 (지연은 짧게 상한, 종료 0.1초 전까지 클램프) */
      if (unplayedCards.length === 1) {
        const remainingMs = Math.max(0, currentTime * 1000);
        const roundEndAt = Date.now() + remainingMs;
        if (aiLastCardPlayAtRef.current === 0) {
          const maxDelay = Math.min(1200, Math.max(80, remainingMs * 0.35));
          const jitter = Math.random() * maxDelay;
          const planned = Date.now() + jitter;
          aiLastCardPlayAtRef.current = Math.min(planned, Math.max(Date.now() + 40, roundEndAt - 100));
        }
        if (currentTime <= 0.18 || Date.now() >= aiLastCardPlayAtRef.current) {
          aiLastCardPlayAtRef.current = 0;
          handlePlayCard(cardToPlay);
        }
        return;
      }

      /* AI: 학생 손패를 모른다고 가정 — 전역 rank 기반 targetTime으로 연속 제출하지 않고,
       * 이 카드 초성(ㄱ~ㅎ)과 남은 시간만으로 벽시계 지연을 잡는다.
       * 여기까지 왔다면 AI가 쥔 카드가 이번에 가장 앞서(사전 순) 내야 할 카드이므로 lead 지연으로 과감히 먼저 내기 */
      if (aiPlayScheduledCardIdRef.current !== cardToPlay.id) {
        const g = hangulChoseongIndex(cardToPlay.word?.[0] ?? '');
        const delaySec = aiPlayDelayLeadCard(currentTime, g);
        aiPlayAtWallRef.current = Date.now() + delaySec * 1000;
        aiPlayScheduledCardIdRef.current = cardToPlay.id;
        return;
      }
      if (Date.now() < aiPlayAtWallRef.current) return;

      aiPlayScheduledCardIdRef.current = '';
      handlePlayCard(cardToPlay);
    },
    [allCards, handlePlayCard]
  );

  useEffect(() => {
    if (gameState !== 'playing' || !isPreparing) return;
    if (docHidden) return;
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
  }, [prepTimeLeft, isPreparing, gameState, docHidden]);

  /* 오프라인·호스트: 기존과 동일. 온라인 게스트도 남은 시간 표시는 매 0.1초 갱신(호스트 동기화만으로는 멈춘 것처럼 보이던 현상 완화) */
  const runTimer =
    !netRoom ||
    (netRoom.db && netRoom.roomId && (netRoom.isHost || gameState === 'playing'));

  useEffect(() => {
    if (!runTimer || gameState !== 'playing' || isPaused || isHintMode || isPreparing) return;
    if (docHidden) return;

    /* 시간 초과 처리는 호스트·오프라인만 — 게스트는 호스트가 보낸 game으로만 갱신 */
    if (timeLeft <= 0) {
      if (!netRoom || netRoom.isHost) handleTimeout();
      return;
    }

    const timer = setTimeout(() => {
      const newTime = Math.max(0, timeLeft - 0.1);
      setTimeLeft(newTime);
      /* AI 연산은 호스트(또는 오프라인)만 — 게스트가 돌리면 중복 제출·상태 꼬임 */
      if (!netRoom || netRoom.isHost) checkAiPlays(newTime);
    }, 100);

    return () => clearTimeout(timer);
  }, [timeLeft, gameState, isPaused, isHintMode, isPreparing, runTimer, checkAiPlays, handleTimeout, docHidden, netRoom]);

  /** 온라인: 방 문서 구독 — 로비 복귀·멤버(AI 대체)·게스트 게임 동기화 */
  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId) return undefined;
    const db = netRoom.db;
    const roomId = netRoom.roomId;
    return subscribeRoom(db, roomId, (room) => {
      if (!room) return;
      if (room.phase === 'lobby') {
        lastHydratedGameJsonRef.current = '';
        lastNetworkWriteJsonRef.current = '';
        failedRoundRecoveryRef.current = false;
        appliedRemoteCardIdsRef.current.clear();
        setGuestPlayLocked(false);
        aiCooldownAfterHumanUntilRef.current = 0;
        aiLastCardPlayAtRef.current = 0;
        aiPlayAtWallRef.current = 0;
        aiPlayScheduledCardIdRef.current = '';
        setAllCards([]);
        setPlayedStack([]);
        setMessage('');
        setLevel(1);
        setLives(3);
        setTimeLeft(20);
        setIsPaused(false);
        setUsedWords([]);
        setHints(2);
        setIsHintMode(false);
        setReviewedWords([]);
        setIsPreparing(false);
        setPrepTimeLeft(5);
        setGameState('home');
        setHandDisplayOrder({});
        if (Array.isArray(room.members)) setSessionMembers(room.members);
        syncNetRef(null);
        try {
          onReturnedToLobbyRef.current?.();
        } catch (e) {
          console.error('[onReturnedToLobby]', e);
        }
        return;
      }
      if (room.phase === 'playing' && room.game) {
        if (Array.isArray(room.members)) setSessionMembers(room.members);
        if (!networkRef.current.isHost) {
          try {
            hydrateFromGame(room.game);
          } catch (e) {
            console.error('[subscribeRoom hydrate]', e);
          }
        }
      }
    });
  }, [netRoom, hydrateFromGame, syncNetRef]);

  /** 호스트: 게스트 액션(카드 제출·준비 중 손패 순서) */
  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost) return undefined;
    return subscribeActions(netRoom.db, netRoom.roomId, async (actionDocId, data) => {
      if (data.type === 'REORDER_PREP') {
        const { slot, order } = data;
        if (typeof slot === 'number' && Array.isArray(order)) {
          const key = slotOwner(slot);
          setHandDisplayOrder((prev) => ({ ...prev, [key]: order.map((id) => String(id)) }));
        }
        try {
          await deleteActionDoc(netRoom.db, netRoom.roomId, actionDocId);
        } catch (e) {
          console.error(e);
        }
        return;
      }
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

  /** 살펴보기 시간 중에만 손패 순서 변경(온라인 게스트는 호스트로 전달) */
  const reorderMyHandPrep = useCallback(
    (orderedIds) => {
      if (!isPreparing) return;
      const key = slotOwner(mySlotIndex);
      const ids = orderedIds.map((id) => String(id));
      setHandDisplayOrder((prev) => ({ ...prev, [key]: ids }));
      const net = networkRef.current;
      if (net.db && net.roomId && !net.isHost) {
        pushPrepReorderAction(net.db, net.roomId, { slot: mySlotIndex, order: ids }).catch(console.error);
      }
    },
    [isPreparing, mySlotIndex]
  );

  /* 호스트→Firestore: 시간을 0.5초 단위로 반올림해 쓰기 빈도·페이로드 변동을 줄임 (랙 완화) */
  const gameBlobForNetwork = useMemo(() => {
    /* 0.1초 단위 반올림 — 게스트 화면이 덜 끊겨 보이도록 호스트 동기화 해상도 유지 */
    const roundedTime =
      Number.isFinite(timeLeft) && timeLeft > 0 ? Math.round(timeLeft * 10) / 10 : timeLeft;
    return serializeGame({
      gameState,
      level,
      lives,
      timeLeft: roundedTime,
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
      handDisplayOrder,
    });
  }, [
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
    handDisplayOrder,
  ]);

  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost || gameState === 'home') return undefined;
    const t = setTimeout(() => {
      const payload = gameBlobForNetwork;
      let j;
      try {
        j = JSON.stringify(payload);
      } catch {
        return;
      }
      if (j === lastNetworkWriteJsonRef.current) return;
      lastNetworkWriteJsonRef.current = j;
      updateRoomGame(netRoom.db, netRoom.roomId, netRoom.hostPlayerId, payload).catch(console.error);
    }, 320);
    return () => clearTimeout(t);
  }, [gameBlobForNetwork, gameState, netRoom]);

  const userHand = useMemo(() => {
    const key = slotOwner(mySlotIndex);
    const handCards = allCards.filter((c) => c.owner === key && c.status === 'hand');
    const order = handDisplayOrder[key];
    const map = new Map(handCards.map((c) => [c.id, c]));
    if (!order || order.length === 0) {
      return [...handCards].sort((a, b) => a.rank - b.rank);
    }
    const ordered = order.map((id) => map.get(id)).filter(Boolean);
    const missing = handCards.filter((c) => !order.includes(c.id));
    return [...ordered, ...missing];
  }, [allCards, handDisplayOrder, mySlotIndex]);

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
    performLeaveOnline,
    toggleHintMode,
    handleRevealAICard,
    handlePlayCard,
    reorderMyHandPrep,
    guestPlayLocked,
    userHand,
    lastPlayed,
    sortedPlayedStack,
    netRoom,
  };
}
