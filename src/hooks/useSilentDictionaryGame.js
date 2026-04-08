import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PACK_DATA } from '../data/words.js';
import { shuffleArray, getLevelTime, assignDictionaryRanks, dedupeWordEntriesByWord } from '../utils/helpers.js';
import {
  startRoomGame,
  updateRoomGame,
  subscribeRoom,
  subscribeActions,
  deleteActionDoc,
  pushPlayAction,
  pushPrepReorderAction,
  pushHintToggleAction,
  returnRoomToLobby,
  playerSelfLeaveRoom,
  ROOM_MAX,
} from '../lib/roomService.js';
import {
  playCorrectPlacedNote,
  playWrongPlacedBuzz,
  resetCorrectNoteSequence,
} from '../lib/gameSounds.js';
import { writeOfflineRunSave, clearOfflineRunSave } from '../lib/runSave.js';
import { clearRoomSession } from '../utils/roomSession.js';
import { TOTAL_LEVELS } from '../constants/game.js';

const DEFAULT_PACK_KEY = 'kindergarten';

function resolvePack(packKey) {
  const p = PACK_DATA[packKey];
  if (p?.words?.length) return { key: packKey, pack: p };
  return { key: DEFAULT_PACK_KEY, pack: PACK_DATA[DEFAULT_PACK_KEY] };
}

/** AI 제출 사이 최소 간격(ms) — 연속 턴이 너무 빠르게 보이지 않도록 */
const MIN_AI_PLAY_GAP_MS = 520;

function slotOwner(i) {
  return `s${i}`;
}

function parseSlot(owner) {
  const n = parseInt(String(owner).replace(/^s/, ''), 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * AI 제출 전 대기(ms). 균일 짧은 지연 대신 빠름/보통/망설임이 섞이도록 샘플링.
 * 협동 규칙(정답 카드)은 그대로 두고 타이밍만 사람스럽게 조정한다.
 * @param {{ multiCard: boolean, secondsLeft: number, afterHumanBonusMs?: number }} p
 */
function sampleAiReactionDelayMs(p) {
  const { multiCard, secondsLeft, afterHumanBonusMs = 0 } = p;
  const t = typeof secondsLeft === 'number' && Number.isFinite(secondsLeft) ? secondsLeft : 20;
  let base;
  if (multiCard) {
    const roll = Math.random();
    if (roll < 0.36) {
      base = 260 + Math.random() * 480;
    } else if (roll < 0.86) {
      base = 620 + Math.random() * 980;
    } else {
      base = 1500 + Math.random() * 1500;
    }
    if (Math.random() < 0.07) {
      base += 700 + Math.random() * 1100;
    }
    base += afterHumanBonusMs;
    if (t < 5) base *= 0.7 + Math.random() * 0.18;
    if (t < 2) base *= 0.58 + Math.random() * 0.14;
  } else {
    base = 160 + Math.random() * 560;
    if (t < 3) base *= 0.62 + Math.random() * 0.12;
  }
  return Math.max(70, Math.round(base));
}

/** 생명이 3일 때만, 낮은 확률로 AI가 이번 선두 카드 대신 손의 다른 카드를 냄(실수 연출) */
function pickAiIntentionalBlunderCard(unplayedCards, lowestRank, aiSlot, livesNow) {
  if (livesNow !== 3) return null;
  const RATE = 0.012;
  if (Math.random() >= RATE) return null;
  const aiCards = unplayedCards.filter((c) => parseSlot(c.owner) === aiSlot);
  const wrong = aiCards.filter((c) => c.rank > lowestRank);
  if (wrong.length === 0) return null;
  return wrong[Math.floor(Math.random() * wrong.length)];
}

/** 오프라인에서 사람 1명·AI 1명만 있는 세션(1대1) */
function isOfflineOneVsOneAi(members, hasNetDb) {
  if (hasNetDb) return false;
  if (!members || members.length !== 2) return false;
  let h = 0;
  let a = 0;
  for (const m of members) {
    if (!m) continue;
    if (m.isAI) a += 1;
    else h += 1;
  }
  return h === 1 && a === 1;
}

/**
 * 이번 선두가 사람 손에 있을 때 — 남은 시간·남은 장수로 촉박하면 AI가 오답으로 끼어들 수 있음
 * (기다리면 AI가 정답만 내서 너무 쉬워지는 것 방지)
 */
function shouldAiForceWrongWhenHumanStalls(currentTime, unplayedCount, level) {
  const T0 = getLevelTime(level);
  if (currentTime <= 0.2 || unplayedCount < 2) return false;
  const elapsed = T0 - currentTime;
  /* 라운드 직후 짧은 시간은 사람에게 양보 */
  if (elapsed < Math.min(3.2, T0 * 0.11)) return false;
  const per = currentTime / unplayedCount;
  /* 장당 남은 초가 넉넉하면 대기 */
  if (per >= 1.18) return false;
  /* 전체 제한 시간의 상당 부분이 남았으면(초반) 아직 끼어들지 않음 */
  if (currentTime > T0 * 0.72) return false;
  return true;
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
    /** 길라잡이를 켠 사람 표시명(온라인 동기화) */
    hintActorName: s.hintActorName ?? '',
    /** 테이블 확인 단계(온라인: 호스트 타이머 기준 동기화) */
    tableReviewSecondsLeft: s.tableReviewSecondsLeft ?? 0,
    pendingAfterTableReview: s.pendingAfterTableReview ?? null,
    gameOverExplain: s.gameOverExplain ?? null,
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
 * @param {{ onReturnedToLobby?: () => void, onLevelCleared?: (packKey: string, clearedLevel: number) => void }} [options]
 */
export function useSilentDictionaryGame(options = {}) {
  const { onReturnedToLobby, onLevelCleared } = options;
  const onReturnedToLobbyRef = useRef(onReturnedToLobby);
  const onLevelClearedRef = useRef(onLevelCleared);
  useEffect(() => {
    onReturnedToLobbyRef.current = onReturnedToLobby;
  }, [onReturnedToLobby]);
  useEffect(() => {
    onLevelClearedRef.current = onLevelCleared;
  }, [onLevelCleared]);
  const [gameState, setGameState] = useState('home');
  /** 레벨 클리어·게임 오버 직전: 제출된 카드를 보며 복습 준비(초) */
  const [tableReviewSecondsLeft, setTableReviewSecondsLeft] = useState(0);
  /** table_review 종료 후 이어질 상태 */
  const [pendingAfterTableReview, setPendingAfterTableReview] = useState(null);
  /** 게임 오버 모달용 — 순서 오류·타임아웃 설명 */
  const [gameOverExplain, setGameOverExplain] = useState(null);
  const gameStateRef = useRef(gameState);
  const pendingAfterTableReviewRef = useRef(null);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(() => getLevelTime(1));
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState('');

  const [usedWords, setUsedWords] = useState([]);
  const [hints, setHints] = useState(2);
  const [isHintMode, setIsHintMode] = useState(false);
  /** 길라잡이를 연 플레이어 표시 이름(팝업·동기화) */
  const [hintActorName, setHintActorName] = useState('');
  const [reviewedWords, setReviewedWords] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [showWordList, setShowWordList] = useState(false);

  const [isPreparing, setIsPreparing] = useState(false);
  const [prepTimeLeft, setPrepTimeLeft] = useState(5);

  const [selectedPackKey, setSelectedPackKey] = useState('kindergarten');
  const currentWordDB = PACK_DATA[selectedPackKey]?.words ?? PACK_DATA.kindergarten.words;

  const [allCards, setAllCards] = useState([]);
  /** @type {Record<string, string[]>} 슬롯(owner 키)별 손패 카드 id 표시 순서 */
  const [handDisplayOrder, setHandDisplayOrder] = useState({});
  const allCardsRef = useRef([]);
  /** 실수로 판이 끝난 뒤 같은 레벨 재시작을 이미 걸었는지(중복 방지) */
  const failedRoundRecoveryRef = useRef(false);
  /** 손패가 한 장만 남았을 때 AI 제출 시각(targetTime 무시, 남은 시간 내 랜덤) */
  const aiLastCardPlayAtRef = useRef(0);
  /** AI 다음 제출 벽시각(ms). 학생 패를 모른다고 가정해 전역 targetTime 대신 초성·남은 시간으로만 스케줄 */
  const aiPlayAtWallRef = useRef(0);
  const aiPlayScheduledCardIdRef = useRef('');
  /** 직전에 정상 제출한 플레이어가 사람이면 true — AI가 다음 수에 약간 더 늦게 반응 */
  const aiLastPlayWasHumanRef = useRef(false);
  /** 오프라인 1대1: 사람이 선두 카드를 안 낼 때 AI 오답 끼어들기 스케줄 */
  const aiHumanStallForceAtRef = useRef(0);
  const aiHumanStallForceCardIdRef = useRef('');
  /** 직전 정상 제출이 AI였는지 — 연속 AI 턴 사이 간격용 */
  const aiLastPlayWasAiRef = useRef(false);
  /** AI가 카드를 여러 장 연속으로 주르륵 내지 않도록 최소 대기(ms) — wall 시각과 별도 */
  const aiNextPlayAllowedAtRef = useRef(0);
  /** 호스트: 처음부터·재시작 직후 Firestore에 즉시 동기화 */
  const flushNetworkGameAfterRestartRef = useRef(false);
  /** 이번 라운드 전체 카드 수(첫 제출이 AI 선두일 때 연출용) */
  const roundTotalCardsRef = useRef(0);
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

  /** 레벨 클리어 직후(모달 진입 시점) — 서버에 최대 레벨 기록 */
  const prevGameStateForClearRef = useRef('');
  useEffect(() => {
    if (gameState === 'level_clear' && prevGameStateForClearRef.current !== 'level_clear') {
      const net = networkRef.current;
      const offline = !net?.db;
      const mem = sessionMembersRef.current;
      const humans = mem.filter((m) => m && !m.isAI).length;
      const ais = mem.filter((m) => m && m.isAI).length;
      /** 팩 잠금·명예의 전당: 오프라인이고 사람 1·가상 1일 때만 인정 */
      const eligible = offline && mem.length === 2 && humans === 1 && ais === 1;
      onLevelClearedRef.current?.(selectedPackKey, level, { eligible });
    }
    prevGameStateForClearRef.current = gameState;
  }, [gameState, level, selectedPackKey]);

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

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    pendingAfterTableReviewRef.current = pendingAfterTableReview;
  }, [pendingAfterTableReview]);

  const scheduleAfterTableReview = useCallback((next, explain = null) => {
    pendingAfterTableReviewRef.current = next;
    setPendingAfterTableReview(next);
    setGameOverExplain(explain);
    setTableReviewSecondsLeft(next === 'game_over' ? 18 : 15);
    setIsPaused(true);
    setGameState('table_review');
  }, []);

  const finishTableReview = useCallback(() => {
    const next = pendingAfterTableReviewRef.current;
    pendingAfterTableReviewRef.current = null;
    setPendingAfterTableReview(null);
    setTableReviewSecondsLeft(0);
    if (!next) return;
    if (next === 'level_clear') {
      setGameOverExplain(null);
      setGameState('level_clear');
    } else {
      setGameState('game_over');
    }
  }, []);

  /** 테이블 확인 카운트다운 — 온라인 참가자는 호스트 스냅샷만 따름 */
  useEffect(() => {
    if (gameState !== 'table_review') return undefined;
    const net = networkRef.current;
    if (net.db && net.roomId && !net.isHost) return undefined;
    if (tableReviewSecondsLeft <= 0) {
      finishTableReview();
      return undefined;
    }
    const t = setTimeout(() => setTableReviewSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [gameState, tableReviewSecondsLeft, finishTableReview]);

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
      const safeTime = Number.isFinite(Number(g.timeLeft))
        ? Number(g.timeLeft)
        : getLevelTime(safeLevel);

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
      setHintActorName(typeof g.hintActorName === 'string' ? g.hintActorName : '');
      setReviewedWords(Array.isArray(g.reviewedWords) ? g.reviewedWords : []);
      setIsPreparing(Boolean(g.isPreparing));
      setPrepTimeLeft(
        Math.min(60, Math.max(0, Number.isFinite(Number(g.prepTimeLeft)) ? Math.floor(Number(g.prepTimeLeft)) : 5))
      );
      setAllCards(safeCards);
      roundTotalCardsRef.current = safeCards.length;
      setPlayedStack(safeStack);
      setSelectedPackKey(pk);

      const tr = Number.isFinite(Number(g.tableReviewSecondsLeft))
        ? Math.min(120, Math.max(0, Math.floor(Number(g.tableReviewSecondsLeft))))
        : 0;
      setTableReviewSecondsLeft(tr);
      const pend = g.pendingAfterTableReview;
      if (pend === 'level_clear' || pend === 'game_over') {
        pendingAfterTableReviewRef.current = pend;
        setPendingAfterTableReview(pend);
      } else {
        pendingAfterTableReviewRef.current = null;
        setPendingAfterTableReview(null);
      }
      const ex = g.gameOverExplain;
      setGameOverExplain(ex && typeof ex === 'object' ? ex : null);

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
    aiLastCardPlayAtRef.current = 0;
    aiPlayAtWallRef.current = 0;
    aiPlayScheduledCardIdRef.current = '';
    aiNextPlayAllowedAtRef.current = 0;
    aiLastPlayWasHumanRef.current = false;
    aiHumanStallForceAtRef.current = 0;
    aiHumanStallForceCardIdRef.current = '';
    aiLastPlayWasAiRef.current = false;
    roundTotalCardsRef.current = bundle.allCards.length;
    setAllCards(bundle.allCards);
    setPlayedStack(bundle.playedStack);
    setLevel(bundle.level);
    setTimeLeft(bundle.timeLeft);
    setUsedWords(bundle.usedWords);
    setIsPreparing(bundle.isPreparing);
    setPrepTimeLeft(bundle.prepTimeLeft);
    setGameState(bundle.gameState);
    setTableReviewSecondsLeft(0);
    setPendingAfterTableReview(null);
    pendingAfterTableReviewRef.current = null;
    setGameOverExplain(null);
    resetCorrectNoteSequence();
    setIsPaused(false);
    setIsHintMode(false);
    setHintActorName('');
    setReviewedWords([]);
    setMessage('');
    setHandDisplayOrder(bundle.handDisplayOrder ?? {});
  }, []);

  const startLevel = useCallback(
    (targetLevel, keepUsedWords = true, membersArg, usedWordsOverride, packKeyOverride) => {
      const members = membersArg ?? sessionMembersRef.current;
      const uw = usedWordsOverride !== undefined ? usedWordsOverride : usedWords;
      const pk = packKeyOverride !== undefined ? packKeyOverride : selectedPackKey;
      const bundle = buildLevelBundle(targetLevel, members, pk, uw, keepUsedWords);
      if (!bundle) {
        setMessage('단어를 구성할 수 없습니다. 참가 인원(2~15명)과 난이도를 확인해 주세요.');
        return;
      }
      applyLevelBundle(bundle);
      if (packKeyOverride !== undefined) {
        setSelectedPackKey(pk);
      }
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

  /* 손패가 모두 처리됨(제출·폐기): 생명 남으면 레벨 클리어, 없으면 재시작 — 폐기 여부와 무관(실패 후 손패만 비어도 진행) */
  useEffect(() => {
    if (gameState !== 'playing' || isPreparing) return;
    const cards = allCards;
    if (cards.length === 0) return;
    const unplayed = cards.filter((c) => c.status === 'hand');
    if (unplayed.length !== 0) return;
    if (failedRoundRecoveryRef.current) return;
    if (livesRef.current > 0) {
      failedRoundRecoveryRef.current = true;
      setIsPaused(true);
      scheduleAfterTableReview('level_clear');
      return;
    }
    restartLevelAfterFailedRound();
  }, [allCards, gameState, isPreparing, restartLevelAfterFailedRound, scheduleAfterTableReview]);

  /** 로비로 나가기·스냅샷 복귀 시 로컬 판 상태 초기화 — 아래 saveOfflineRunAndGoLobby가 [resetToLobby]를 쓰므로 온라인 시작보다 먼저 선언 */
  const resetToLobby = useCallback(() => {
    lastHydratedGameJsonRef.current = '';
    lastNetworkWriteJsonRef.current = '';
    failedRoundRecoveryRef.current = false;
    appliedRemoteCardIdsRef.current.clear();
    setGuestPlayLocked(false);
    aiLastCardPlayAtRef.current = 0;
    aiPlayAtWallRef.current = 0;
    aiPlayScheduledCardIdRef.current = '';
    aiNextPlayAllowedAtRef.current = 0;
    aiLastPlayWasHumanRef.current = false;
    aiHumanStallForceAtRef.current = 0;
    aiHumanStallForceCardIdRef.current = '';
    aiLastPlayWasAiRef.current = false;
    roundTotalCardsRef.current = 0;
    syncNetRef(null);
    setGameState('home');
    setTableReviewSecondsLeft(0);
    setPendingAfterTableReview(null);
    pendingAfterTableReviewRef.current = null;
    setGameOverExplain(null);
    resetCorrectNoteSequence();
    setSessionMembers([]);
    setAllCards([]);
    setPlayedStack([]);
    setMessage('');
    setLevel(1);
    setLives(3);
    setTimeLeft(getLevelTime(1));
    setIsPaused(false);
    setUsedWords([]);
    setHints(2);
    setIsHintMode(false);
    setHintActorName('');
    setReviewedWords([]);
    setIsPreparing(false);
    setPrepTimeLeft(5);
    setHandDisplayOrder({});
  }, [syncNetRef]);

  /**
   * 온라인 호스트: 방 문서를 playing으로 올린 뒤에만 net 구독을 켬.
   * (구독이 lobby 스냅샷을 먼저 받으면 호스트 로컬 판이 초기화되어 카드가 비는 버그 방지)
   */
  const beginOnlineHostGame = useCallback(
    async ({ db, roomId, members, mySlot, packKey, hostPlayerId, playerId }) => {
      lastNetworkWriteJsonRef.current = '';
      failedRoundRecoveryRef.current = false;
      appliedRemoteCardIdsRef.current.clear();
      setGuestPlayLocked(false);
      aiLastCardPlayAtRef.current = 0;
      aiPlayAtWallRef.current = 0;
      aiPlayScheduledCardIdRef.current = '';
      aiNextPlayAllowedAtRef.current = 0;
      aiLastPlayWasHumanRef.current = false;
      aiHumanStallForceAtRef.current = 0;
      aiHumanStallForceCardIdRef.current = '';
      aiLastPlayWasAiRef.current = false;

      setSessionMembers(members);
      setMySlotIndex(mySlot);
      setSelectedPackKey(packKey);
      setLives(3);
      setHints(2);
      setUsedWords([]);
      const bundle = buildLevelBundle(1, members, packKey, [], false);
      if (!bundle) return;
      roundTotalCardsRef.current = bundle.allCards.length;
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
      setHintActorName('');
      setReviewedWords([]);
      setMessage('');
      setTableReviewSecondsLeft(0);
      setPendingAfterTableReview(null);
      pendingAfterTableReviewRef.current = null;
      setGameOverExplain(null);
      resetCorrectNoteSequence();

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
        hintActorName: '',
        reviewedWords: [],
        isPreparing: bundle.isPreparing,
        prepTimeLeft: bundle.prepTimeLeft,
        allCards: bundle.allCards,
        playedStack: bundle.playedStack,
        selectedPackKey: packKey,
        handDisplayOrder: bundle.handDisplayOrder ?? {},
        tableReviewSecondsLeft: 0,
        pendingAfterTableReview: null,
        gameOverExplain: null,
      });
      try {
        await startRoomGame(db, roomId, hostPlayerId, snapshot);
      } catch (e) {
        console.error('[beginOnlineHostGame]', e);
        resetToLobby();
        throw e;
      }
      syncNetRef({ db, roomId, isHost: true, hostPlayerId, playerId });
    },
    [syncNetRef, resetToLobby]
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

  /** 로컬 저장 데이터로 오프라인 판 재개 */
  const resumeOfflineRun = useCallback(
    (members, packKey, playerId, saved) => {
      if (!saved || saved.v !== 1 || !PACK_DATA[saved.packKey]) return;
      lastHydratedGameJsonRef.current = '';
      lastNetworkWriteJsonRef.current = '';
      failedRoundRecoveryRef.current = false;
      appliedRemoteCardIdsRef.current.clear();
      setGuestPlayLocked(false);
      aiLastCardPlayAtRef.current = 0;
      aiPlayAtWallRef.current = 0;
      aiPlayScheduledCardIdRef.current = '';
      aiNextPlayAllowedAtRef.current = 0;
      aiLastPlayWasHumanRef.current = false;
      aiHumanStallForceAtRef.current = 0;
      aiHumanStallForceCardIdRef.current = '';
      aiLastPlayWasAiRef.current = false;
      syncNetRef(null);
      networkRef.current.playerId = playerId;
      networkRef.current.hostPlayerId = playerId;
      setSessionMembers(members);
      const idx = members.findIndex((m) => m.playerId === playerId);
      setMySlotIndex(idx >= 0 ? idx : 0);
      const uw = Array.isArray(saved.usedWords) ? saved.usedWords : [];
      const nl = Math.min(TOTAL_LEVELS, Math.max(1, Number(saved.nextLevel) || 1));
      const nextLives = Math.min(99, Math.max(1, Number(saved.lives) || 3));
      const nextHints = Math.min(99, Math.max(0, Number.isFinite(Number(saved.hints)) ? Number(saved.hints) : 2));
      setLives(nextLives);
      setHints(nextHints);
      startLevel(nl, true, members, uw, packKey);
      /* 이어하기 세이브는 1회 소비 — 동일 데이터로 반복 이어하기 방지 */
      clearOfflineRunSave();
    },
    [startLevel, syncNetRef]
  );

  /** 레벨 클리어 후 저장하고 로비 — 오프라인 단일 플레이만 (온라인은 로비만) */
  const saveOfflineRunAndGoLobby = useCallback(() => {
    const net = networkRef.current;
    if (net?.db && net?.roomId) {
      resetToLobby();
      onReturnedToLobbyRef.current?.();
      return;
    }
    if (level < TOTAL_LEVELS) {
      writeOfflineRunSave({
        packKey: selectedPackKey,
        nextLevel: level + 1,
        usedWords: [...usedWords],
        lives,
        hints,
      });
    } else {
      clearOfflineRunSave();
    }
    resetToLobby();
    onReturnedToLobbyRef.current?.();
  }, [level, selectedPackKey, usedWords, lives, hints, resetToLobby]);

  const setPlayerContext = useCallback((playerId, hostPlayerId) => {
    networkRef.current.playerId = playerId;
    networkRef.current.hostPlayerId = hostPlayerId || playerId;
  }, []);

  const startGame = () => {
    const net = networkRef.current;
    /* 온라인 게스트: 호스트 판만 유효 — 로컬에서 레벨을 다시 섞으면 손패·타이머가 어긋남 */
    if (net.db && net.roomId && !net.isHost) {
      return;
    }
    setLives(3);
    setHints(2);
    setUsedWords([]);
    /* setUsedWords 비동기 반영 전에 빈 목록으로 섞어 뽑기 */
    startLevel(1, false, undefined, []);
    if (net.db && net.roomId && net.isHost) {
      flushNetworkGameAfterRestartRef.current = true;
      lastNetworkWriteJsonRef.current = '';
    }
  };

  /** 온라인: Firestore에 로비 반영 후 로컬 초기화 (로비 버튼·결과 화면) */
  const performLeaveOnline = useCallback(async () => {
    const net = networkRef.current;
    if (!net.db || !net.roomId) {
      resetToLobby();
      return;
    }
    try {
      clearRoomSession();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sisort-left-online-room'));
      }
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

  const toggleHintMode = useCallback(() => {
    const net = networkRef.current;
    const mem = sessionMembersRef.current[mySlotIndex];
    const actor = mem?.name || '플레이어';
    if (net.db && net.roomId && !net.isHost) {
      if (!isHintMode && hints <= 0) return;
      pushHintToggleAction(net.db, net.roomId, {
        turnOn: !isHintMode,
        playerName: actor,
        slot: mySlotIndex,
      }).catch(console.error);
      return;
    }
    if (hints > 0 && !isHintMode) {
      setIsHintMode(true);
      setHintActorName(actor);
      setMessage(
        `[길라잡이]\n${actor}님이 길라잡이를 켰습니다.\n원하는 상대의 뒤집힌 카드를 클릭해 엿보세요!`
      );
    } else if (isHintMode) {
      setIsHintMode(false);
      setHintActorName('');
      setMessage('');
    }
  }, [hints, isHintMode, mySlotIndex]);

  const handleRevealAICard = (cardId) => {
    if (!isHintMode) return;
    setAllCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, revealed: true } : c)));
    setHints((prev) => prev - 1);
    setIsHintMode(false);
    setHintActorName('');
    setMessage('');
  };

  const handleMistake = useCallback((wrongCard) => {
    const prev = allCardsRef.current;
    const stillInHand = prev.find((c) => c.id === wrongCard.id);
    if (!stillInHand || stillInHand.status !== 'hand') return;

    playWrongPlacedBuzz();
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
        const explain = {
          kind: 'wrong_order',
          playedWord: wrongCard.word,
          missedWords: sortedDisc.map((c) => c.word),
        };
        scheduleAfterTableReview('game_over', explain);
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
  }, [scheduleAfterTableReview]);

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
          aiPlayScheduledCardIdRef.current = '';
          aiPlayAtWallRef.current = 0;
        }
        aiLastPlayWasHumanRef.current = !!(mem && !mem.isAI);
        aiLastPlayWasAiRef.current = !!(mem && mem.isAI);
        aiHumanStallForceAtRef.current = 0;
        aiHumanStallForceCardIdRef.current = '';
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
        playCorrectPlacedNote();

        if (unplayedCards.length === 1) {
          setIsPaused(true);
          if (level % 3 === 0) setHints((h) => h + 1);
          scheduleAfterTableReview('level_clear');
        }
      } else {
        handleMistake(cardToPlay);
      }
    },
    [
      gameState,
      isPaused,
      isPreparing,
      allCards,
      level,
      mySlotIndex,
      handleMistake,
      guestPlayLocked,
      scheduleAfterTableReview,
    ]
  );

  /**
   * 호스트만: 다른 슬롯에서 원격으로 낸 카드 반영(멱등 — 동일 카드 id 중복 처리 방지)
   */
  const applyRemotePlay = useCallback(
    (cardId, fromSlot) => {
      if (gameStateRef.current !== 'playing') return;
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
          aiPlayScheduledCardIdRef.current = '';
          aiPlayAtWallRef.current = 0;
        }
        aiLastPlayWasHumanRef.current = !!(m && !m.isAI);
        aiLastPlayWasAiRef.current = !!(m && m.isAI);
        aiHumanStallForceAtRef.current = 0;
        aiHumanStallForceCardIdRef.current = '';
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
        playCorrectPlacedNote();
        if (unplayedCards.length === 1) {
          setIsPaused(true);
          if (level % 3 === 0) setHints((h) => h + 1);
          scheduleAfterTableReview('level_clear');
        }
        return;
      }

      const live = allCardsRef.current.find((c) => c.id === id);
      if (!live || live.status !== 'hand') return;
      appliedRemoteCardIdsRef.current.add(id);
      handleMistake(cardToPlay);
    },
    [level, handleMistake, scheduleAfterTableReview]
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
          aiNextPlayAllowedAtRef.current = Date.now() + MIN_AI_PLAY_GAP_MS;
          return;
        }
      }
    }

    /* 오프라인: 남은 패가 모두 가상 플레이어 것(2장 이상) — 시간 초과로 생명을 깎지 않고 버퍼만 부여 */
    const netDb = !!networkRef.current?.db;
    if (!netDb && unplayed.length > 1) {
      const onlyAiLeft = unplayed.every((c) => {
        const si = parseSlot(c.owner);
        return si >= 0 && sessionMembersRef.current[si]?.isAI === true;
      });
      if (onlyAiLeft) {
        const grace = Math.min(22, Math.max(5, unplayed.length * 2));
        setTimeLeft(grace);
        setMessage('');
        setIsPaused(false);
        return;
      }
    }

    /* 실수 후 손패 없음: 타임아웃으로 이중 차감 방지 */
    if (unplayed.length === 0 && cards.length > 0) {
      if (hasDiscarded) {
        if (failedRoundRecoveryRef.current) return;
        if (livesRef.current > 0) {
          failedRoundRecoveryRef.current = true;
          setIsPaused(true);
          scheduleAfterTableReview('level_clear');
        } else {
          restartLevelAfterFailedRound();
        }
        return;
      }
      setIsPaused(true);
      if (gameStateRef.current === 'playing') {
        scheduleAfterTableReview('level_clear');
      }
      return;
    }

    setIsPaused(true);
    setLives((prev) => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        scheduleAfterTableReview('game_over', { kind: 'timeout' });
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
  }, [level, startLevel, restartLevelAfterFailedRound, handlePlayCard, scheduleAfterTableReview]);

  const checkAiPlays = useCallback(
    (currentTime) => {
      const members = sessionMembersRef.current;
      const unplayedCards = allCards.filter((c) => c.status === 'hand');
      if (unplayedCards.length === 0) return;

      const onlyAiUnplayed = unplayedCards.every((c) => {
        const s = parseSlot(c.owner);
        return s >= 0 && members[s]?.isAI === true;
      });
      /** 남은 패가 전부 가상 플레이어 것이고 시간이 2초 이하 — 연속 제출 허용(최소 간격·벽 지연 완화) */
      const rushAiOnlyEnd = onlyAiUnplayed && currentTime <= 2;

      if (!rushAiOnlyEnd && Date.now() < aiNextPlayAllowedAtRef.current) return;

      if (unplayedCards.length !== 1) {
        aiLastCardPlayAtRef.current = 0;
      } else {
        aiPlayScheduledCardIdRef.current = '';
        aiPlayAtWallRef.current = 0;
      }

      const ranks = unplayedCards.map((c) => c.rank).filter((r) => Number.isFinite(r));
      if (ranks.length === 0) return;
      const lowestRank = Math.min(...ranks);
      const cardToPlay = unplayedCards.find((c) => c.rank === lowestRank);
      if (!cardToPlay) return;

      const si = parseSlot(cardToPlay.owner);
      if (si < 0 || !members[si]) return;

      /* 선두가 사람(오프라인 1대1): 남은 시간이 촉박하면 AI가 손에서 오답을 내어 진행(정답만 기다리기 방지) */
      if (members[si].isAI !== true) {
        const netDb = !!networkRef.current?.db;
        if (isOfflineOneVsOneAi(members, netDb) && unplayedCards.length >= 2) {
          const aiSlot = members.findIndex((m) => m && m.isAI);
          if (aiSlot >= 0) {
            const wrongPool = unplayedCards.filter(
              (c) => parseSlot(c.owner) === aiSlot && c.rank > lowestRank
            );
            if (wrongPool.length > 0 && shouldAiForceWrongWhenHumanStalls(currentTime, unplayedCards.length, level)) {
              const sid = aiHumanStallForceCardIdRef.current;
              if (sid && !wrongPool.some((c) => c.id === sid)) {
                aiHumanStallForceAtRef.current = 0;
                aiHumanStallForceCardIdRef.current = '';
              }
              if (aiHumanStallForceAtRef.current === 0) {
                const pick = wrongPool[Math.floor(Math.random() * wrongPool.length)];
                aiHumanStallForceCardIdRef.current = pick.id;
                aiHumanStallForceAtRef.current = Date.now() + 140 + Math.random() * 360;
              }
              if (Date.now() >= aiHumanStallForceAtRef.current) {
                const forced = unplayedCards.find((c) => c.id === aiHumanStallForceCardIdRef.current);
                aiHumanStallForceAtRef.current = 0;
                aiHumanStallForceCardIdRef.current = '';
                if (forced) {
                  handlePlayCard(forced);
                  if (!rushAiOnlyEnd) {
                    aiNextPlayAllowedAtRef.current = Date.now() + MIN_AI_PLAY_GAP_MS;
                  }
                }
              }
            } else {
              aiHumanStallForceAtRef.current = 0;
              aiHumanStallForceCardIdRef.current = '';
            }
          }
        }
        return;
      }

      aiHumanStallForceAtRef.current = 0;
      aiHumanStallForceCardIdRef.current = '';

      /* 마지막 한 장(AI): 사람처럼 수백 ms 단위 지연 — rush 시 지연 없이 즉시 */
      if (unplayedCards.length === 1) {
        const remainingMs = Math.max(0, currentTime * 1000);
        const roundEndAt = Date.now() + remainingMs;
        if (rushAiOnlyEnd) {
          aiLastCardPlayAtRef.current = 0;
        } else if (aiLastCardPlayAtRef.current === 0) {
          const jitter = sampleAiReactionDelayMs({ multiCard: false, secondsLeft: currentTime });
          aiLastCardPlayAtRef.current = Math.min(Date.now() + jitter, Math.max(Date.now() + 30, roundEndAt - 80));
        }
        if (currentTime <= 0.12 || Date.now() >= aiLastCardPlayAtRef.current) {
          aiLastCardPlayAtRef.current = 0;
          const blunder = pickAiIntentionalBlunderCard(
            unplayedCards,
            lowestRank,
            si,
            livesRef.current
          );
          handlePlayCard(blunder || cardToPlay);
          if (!rushAiOnlyEnd) {
            aiNextPlayAllowedAtRef.current = Date.now() + MIN_AI_PLAY_GAP_MS;
          }
        }
        return;
      }

      /* AI 다장: 선두·연속 AI 턴은 텀을 넉넉히 — rush 시 벽 없이 연속 제출 */
      if (aiPlayScheduledCardIdRef.current !== cardToPlay.id) {
        if (!rushAiOnlyEnd) {
          const afterHumanLead =
            aiLastPlayWasHumanRef.current && Math.random() < 0.78 ? 220 + Math.random() * 780 : 0;
          let chainGap = 0;
          if (aiLastPlayWasAiRef.current) {
            chainGap += 520 + Math.random() * 1780;
          }
          let openingLead = 0;
          if (unplayedCards.length === roundTotalCardsRef.current && members[si]?.isAI) {
            openingLead += 400 + Math.random() * 950;
          }
          const delayMs = sampleAiReactionDelayMs({
            multiCard: true,
            secondsLeft: currentTime,
            afterHumanBonusMs: afterHumanLead + chainGap + openingLead,
          });
          aiPlayAtWallRef.current = Date.now() + delayMs;
          aiPlayScheduledCardIdRef.current = cardToPlay.id;
          return;
        }
        aiPlayScheduledCardIdRef.current = cardToPlay.id;
        aiPlayAtWallRef.current = 0;
      }
      if (Date.now() < aiPlayAtWallRef.current) return;

      aiPlayScheduledCardIdRef.current = '';
      const blunder = pickAiIntentionalBlunderCard(unplayedCards, lowestRank, si, livesRef.current);
      handlePlayCard(blunder || cardToPlay);
      if (!rushAiOnlyEnd) {
        aiNextPlayAllowedAtRef.current = Date.now() + MIN_AI_PLAY_GAP_MS;
      }
    },
    [allCards, handlePlayCard, level]
  );

  useEffect(() => {
    if (gameState !== 'playing' || !isPreparing) return;
    if (docHidden) return;
    /* 온라인 게스트: 살펴보기 초·본편 시작은 호스트 game 스냅샷만 신뢰 (로컬 카운트다운 시 어긋남) */
    const net = networkRef.current;
    if (net.db && net.roomId && !net.isHost) return;
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

  /* 오프라인·호스트만 타이머 감소·시간초과·AI. 온라인 게스트는 호스트 스냅샷으로만 timeLeft·상태 동기화 (0초에서 멈춤·빈 손패 버그 방지) */
  const runTimer =
    !netRoom ||
    (netRoom.db && netRoom.roomId && (netRoom.isHost || gameState === 'playing'));

  useEffect(() => {
    if (!runTimer || gameState !== 'playing' || isPaused || isHintMode || isPreparing) return;
    if (docHidden) return;
    const net = networkRef.current;
    const guestOnline = !!(net.db && net.roomId && !net.isHost);
    if (guestOnline) return;

    /* 시간 초과 처리는 호스트·오프라인만 */
    if (timeLeft <= 0) {
      if (!netRoom || netRoom.isHost) handleTimeout();
      return;
    }

    const timer = setTimeout(() => {
      const newTime = Math.max(0, timeLeft - 0.1);
      setTimeLeft(newTime);
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
        aiLastCardPlayAtRef.current = 0;
        aiPlayAtWallRef.current = 0;
        aiPlayScheduledCardIdRef.current = '';
        aiNextPlayAllowedAtRef.current = 0;
        aiLastPlayWasHumanRef.current = false;
        aiHumanStallForceAtRef.current = 0;
        aiHumanStallForceCardIdRef.current = '';
        aiLastPlayWasAiRef.current = false;
        roundTotalCardsRef.current = 0;
        setAllCards([]);
        setPlayedStack([]);
        setMessage('');
        setLevel(1);
        setLives(3);
        setTimeLeft(getLevelTime(1));
        setIsPaused(false);
        setUsedWords([]);
        setHints(2);
        setIsHintMode(false);
        setHintActorName('');
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

  /** 호스트: 게스트 액션(카드 제출·손패 순서·길라잡이) */
  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost) return undefined;
    return subscribeActions(netRoom.db, netRoom.roomId, async (actionDocId, data) => {
      if (data.type === 'HINT_TOGGLE') {
        const turnOn = Boolean(data.turnOn);
        const playerName = typeof data.playerName === 'string' ? data.playerName : '플레이어';
        try {
          await deleteActionDoc(netRoom.db, netRoom.roomId, actionDocId);
        } catch (e) {
          console.error(e);
        }
        if (turnOn) {
          setHints((h) => (h > 0 ? h - 1 : h));
          setIsHintMode(true);
          setHintActorName(playerName);
          setMessage(
            `[길라잡이]\n${playerName}님이 길라잡이를 켰습니다.\n원하는 상대의 뒤집힌 카드를 클릭해 엿보세요!`
          );
        } else {
          setIsHintMode(false);
          setHintActorName('');
          setMessage('');
        }
        return;
      }
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

  /** 살펴보기·플레이·일시정지·길라잡이 관계없이 손패 2장 이상이면 드래그 정렬 허용 */
  const canReorderHand = useMemo(() => {
    if (isPreparing) return true;
    if (gameState !== 'playing') return false;
    const key = slotOwner(mySlotIndex);
    const cnt = allCards.filter((c) => c.owner === key && c.status === 'hand').length;
    return cnt > 1;
  }, [isPreparing, gameState, allCards, mySlotIndex]);

  /** 손패 순서 변경(온라인 게스트는 호스트로 전달) */
  const reorderMyHand = useCallback(
    (orderedIds) => {
      if (!canReorderHand) return;
      const key = slotOwner(mySlotIndex);
      const ids = orderedIds.map((id) => String(id));
      setHandDisplayOrder((prev) => ({ ...prev, [key]: ids }));
      const net = networkRef.current;
      if (net.db && net.roomId && !net.isHost) {
        pushPrepReorderAction(net.db, net.roomId, { slot: mySlotIndex, order: ids }).catch(console.error);
      }
    },
    [canReorderHand, mySlotIndex]
  );

  /* 호스트→Firestore: 시간을 0.5초 단위로 반올림해 쓰기 빈도·페이로드 변동을 줄임 (랙 완화) */
  const gameBlobForNetwork = useMemo(() => {
    /* 0.1초 단위 반올림 — 게스트 화면이 덜 끊겨 보이도록 호스트 동기화 해상도 유지 */
    const roundedTime =
      Number.isFinite(timeLeft) && timeLeft > 0 ? Math.round(timeLeft * 10) / 10 : timeLeft;
    try {
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
        hintActorName,
        reviewedWords: Array.isArray(reviewedWords) ? reviewedWords : [],
        isPreparing,
        prepTimeLeft,
        allCards,
        playedStack,
        selectedPackKey,
        handDisplayOrder,
        tableReviewSecondsLeft,
        pendingAfterTableReview,
        gameOverExplain,
      });
    } catch (e) {
      console.error('[serializeGame]', e);
      return {
        v: 1,
        gameState: 'home',
        level: 1,
        lives: 3,
        timeLeft: 0,
        isPaused: false,
        message: '',
        usedWords: [],
        hints: 0,
        isHintMode: false,
        reviewedWords: [],
        isPreparing: false,
        prepTimeLeft: 0,
        allCards: [],
        playedStack: [],
        selectedPackKey: DEFAULT_PACK_KEY,
        handDisplayOrder: {},
        hintActorName: '',
        tableReviewSecondsLeft: 0,
        pendingAfterTableReview: null,
        gameOverExplain: null,
      };
    }
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
    hintActorName,
    reviewedWords,
    isPreparing,
    prepTimeLeft,
    allCards,
    playedStack,
    selectedPackKey,
    handDisplayOrder,
    tableReviewSecondsLeft,
    pendingAfterTableReview,
    gameOverExplain,
  ]);

  useEffect(() => {
    if (!netRoom?.db || !netRoom?.roomId || !netRoom.isHost || gameState === 'home') return undefined;
    const immediate = flushNetworkGameAfterRestartRef.current;
    if (immediate) flushNetworkGameAfterRestartRef.current = false;
    const delayMs = immediate ? 0 : 320;
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
    }, delayMs);
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

  /** 카드 살펴보기 단계에서 즉시 본편 시작(타이머와 동일) */
  const skipPrep = useCallback(() => {
    if (gameState !== 'playing' || !isPreparing) return;
    setPrepTimeLeft(0);
  }, [gameState, isPreparing]);

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
    hintActorName,
    reviewedWords,
    setReviewedWords,
    showRules,
    setShowRules,
    showWordList,
    setShowWordList,
    isPreparing,
    prepTimeLeft,
    skipPrep,
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
    resumeOfflineRun,
    saveOfflineRunAndGoLobby,
    setPlayerContext,
    resetToLobby,
    performLeaveOnline,
    toggleHintMode,
    handleRevealAICard,
    handlePlayCard,
    reorderMyHand,
    reorderMyHandPrep: reorderMyHand,
    canReorderHand,
    guestPlayLocked,
    userHand,
    lastPlayed,
    sortedPlayedStack,
    netRoom,
    tableReviewSecondsLeft,
    gameOverExplain,
    pendingAfterTableReview,
    finishTableReview,
  };
}
