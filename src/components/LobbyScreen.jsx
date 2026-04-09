import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, collection, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import DraggablePanel from './DraggablePanel.jsx';
import JokboWordListModal from './JokboWordListModal.jsx';
import { getFirestoreDb, isFirebaseConfigured, ensureFirebaseAuth } from '../lib/firebase.js';
import { updateUserShownName } from '../lib/userProfileService.js';
import {
  createRoomDoc,
  joinRoomDoc,
  updateRoomMembers,
  kickMemberFromRoom,
  updatePlayerNameInRoom,
  ROOM_MIN,
  ROOM_MAX,
  ONLINE_ROOM_MAX,
} from '../lib/roomService.js';
import { safeSetItem } from '../utils/safeStorage.js';
import { readRoomIdFromSession, persistRoomSession, clearRoomSession } from '../utils/roomSession.js';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from '../lib/roomCode.js';
import { getUnlockedPackKeys, PACK_UNLOCK_ORDER } from '../lib/packOrder.js';
import {
  PACK_IAP_BY_PACK_ID,
  isPackInAppPurchasable,
  filterValidPurchasedPackKeys,
} from '../config/packCatalog.js';
import { devSimulatePurchase } from '../lib/packPurchase.js';
import { loadOfflineRunSave, clearOfflineRunSave } from '../lib/runSave.js';
import { TOTAL_LEVELS } from '../constants/game.js';
import KoreanThemeBackdrop from './KoreanThemeBackdrop.jsx';
import QuickStartGlyph from './QuickStartGlyph.jsx';
import LegalFooterLinks from './LegalFooterLinks.jsx';
import AccountDeleteModal from './AccountDeleteModal.jsx';
import { isMasterAccountEmail } from '../lib/accountIdentity.js';

/**
 * 명예의 전당 — 웹에서는 우측 열, 모바일에서는 하단 탭으로만 표시
 */
function HallOfFamePanel({ hallOfFame, PACK_DATA }) {
  return (
    <div className="rounded-2xl border border-amber-600/50 bg-gradient-to-br from-amber-950/80 via-slate-900 to-violet-950/40 p-4 shadow-lg shadow-amber-900/20">
      <h2 className="text-center text-lg font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 mb-1">
        명예의 전당
      </h2>
      <p className="text-[11px] text-amber-200/70 text-center mb-3 break-keep">
        각 팩 최고 레벨 달성자 표시명. 동점이면 먼저 기록.{' '}
        <strong className="text-amber-100">오프라인·가상 플레이어 1명</strong> 조건의 기록만 반영됩니다.
      </p>
      <ul className="space-y-1.5 max-h-[min(60vh,28rem)] overflow-y-auto text-sm pr-1">
        {PACK_UNLOCK_ORDER.filter((k) => PACK_DATA[k]).map((key) => {
          const rec = hallOfFame[key];
          const pack = PACK_DATA[key];
          return (
            <li
              key={key}
              className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 border-b border-amber-800/30 pb-1.5 text-slate-200"
            >
              <span className="text-slate-400 shrink-0">{pack.name}</span>
              <span className="font-bold text-amber-100 tabular-nums text-right">
                {rec?.holderName
                  ? `${rec.holderName} · 최고 Lv.${rec.maxLevel ?? '—'}`
                  : '아직 기록 없음'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 학습앱형 메인 CTA — 상단 히어로·참가자 카드 하단에서 재사용
 */
function LobbyPrimaryCta({
  mode,
  isHost,
  roomId,
  canStart,
  busy,
  remoteRoom,
  onStartOffline,
  onStartOnline,
  onCreateOnlineRoom,
  compact = false,
}) {
  const sizeCls = compact
    ? 'py-3.5 text-base font-bold'
    : 'py-4 text-lg font-black sm:py-[1.15rem] sm:text-xl';
  if (mode === 'offline') {
    return (
      <button
        type="button"
        onClick={onStartOffline}
        disabled={!canStart}
        className={`flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 ${sizeCls} text-white shadow-lg shadow-emerald-900/30 transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation`}
      >
        <QuickStartGlyph className={compact ? 'scale-90' : ''} />
        빠른 시작
      </button>
    );
  }
  /* 온라인인데 아직 방에 연결 전: 상단에서도 방 만들기와 동일한 주요 CTA 제공 */
  if (mode === 'online' && !roomId && typeof onCreateOnlineRoom === 'function') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={onCreateOnlineRoom}
          disabled={!canStart || busy}
          className={`flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 ${sizeCls} text-white shadow-lg shadow-emerald-900/30 transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation`}
        >
          <QuickStartGlyph className={compact ? 'scale-90' : ''} />
          방 만들기
        </button>
        <p className="text-center text-[11px] text-slate-500 break-keep">
          참가만 할 경우 아래 <strong className="text-slate-300">온라인 방</strong>에서 코드 입력 후 참가를 누르세요.
        </p>
      </div>
    );
  }
  if (mode === 'online' && isHost && roomId) {
    return (
      <button
        type="button"
        onClick={onStartOnline}
        disabled={!canStart || busy || remoteRoom?.phase === 'playing'}
        className={`flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 ${sizeCls} text-white shadow-lg shadow-emerald-900/30 transition-[transform,filter] duration-150 hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 touch-manipulation`}
      >
        <QuickStartGlyph className={compact ? 'scale-90' : ''} />
        빠른 시작 (방장)
      </button>
    );
  }
  if (mode === 'online' && roomId && !isHost) {
    return (
      <div className="rounded-xl bg-slate-900/60 px-3 py-3 text-center text-sm text-slate-400 break-keep">
        <p>방장이 게임을 시작할 때까지 대기 중입니다.</p>
      </div>
    );
  }
  return null;
}

/**
 * 로비: 4자 방 코드, 멀티플레이(Firebase), 오프라인, AI 인원 조절
 */
export default function LobbyScreen({
  game,
  playerName,
  playerId,
  setPlayerName,
  onStartPlay,
  isGuest = false,
  packProgress = {},
  /** 마스터가 부여한 추가 플레이 가능 팩(회원 전용) */
  packUnlockBonus = [],
  /** 인앱 결제 등으로 해금된 팩 키 */
  purchasedPackKeys = [],
  /** 구매·관리 반영 후 팩 상태 다시 불러오기 */
  onRefreshPackEconomy,
  onLogout,
  logoutLabel = '로그아웃',
  onOpenAdmin,
  onOpenMyStats,
  /** 회원일 때 Firestore 표시 이름 동기화용 */
  authUid = null,
  /** 계정 삭제(마스터 제외) 판별용 가상 이메일 */
  authEmail = null,
  /** 앱 내 계정 삭제 완료 후 캐시 정리 */
  onAccountDeleted,
  /** 마스터·전역 관리 계정 — 단어 팩 전부 해금(일반 회원은 진행도·보너스만) */
  isMaster = false,
}) {
  const {
    PACK_DATA,
    selectedPackKey,
    setSelectedPackKey,
    beginOnlineHostGame,
    joinOnlineAsGuest,
    startOfflineFromLobby,
    resumeOfflineRun,
    currentWordDB,
    showRules,
    setShowRules,
    showWordList,
    setShowWordList,
  } = game;

  const db = getFirestoreDb();
  const onlineOk = isFirebaseConfigured() && db;

  const [roomCode, setRoomCode] = useState(() => randomRoomCode());
  const [mode, setMode] = useState('offline'); // offline | online — 기본: 오프라인
  const [roomId, setRoomId] = useState(() => readRoomIdFromSession());

  useEffect(() => {
    persistRoomSession(roomId);
  }, [roomId]);
  const [isHost, setIsHost] = useState(false);
  const [hostPlayerId, setHostPlayerId] = useState(null);
  const [remoteRoom, setRemoteRoom] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const guestPlayStartedRef = useRef(false);
  /** 이 방 스냅샷에서 한 번이라도 members에 본인 playerId가 있었는지 — 캐시·레이스로 빈 목록이 먼저 오면 추방 오인 방지 */
  const seenSelfInMembersRef = useRef(false);
  /** 참가·방 생성 직후 일정 시간은 추방 판정 금지(정상 입장 직후 오인 방지) */
  const kickBlockedUntilRef = useRef(0);
  const [showNameEdit, setShowNameEdit] = useState(false);
  const [nameDraft, setNameDraft] = useState(playerName);
  /** 팩별 최고 레벨 달성자(명예의 전당) */
  const [hallOfFame, setHallOfFame] = useState({});
  /** 모바일: 로비 본화면 vs 명예의 전당 탭 */
  const [lobbyTab, setLobbyTab] = useState('main');
  /** 스토어 정책: 본인 계정 삭제 모달 */
  const [accountDeleteOpen, setAccountDeleteOpen] = useState(false);

  /** 로컬 오프라인 멤버 (1인 + AI) — useState는 이펙트보다 위에 두어 훅 순서를 맞춤 */
  const [localMembers, setLocalMembers] = useState(() => [
    { playerId, name: playerName, isAI: false },
    { playerId: `ai-${Date.now()}`, name: 'AI 1', isAI: true },
  ]);

  /** 익명/이메일 로그인 후 playerId가 바뀌면 로컬 슬롯의 본인 id를 맞춤 (방 hostId·members와 일치) */
  useEffect(() => {
    setLocalMembers((prev) => {
      let changed = false;
      const next = prev.map((m) => {
        if (m.isAI) return m;
        if (String(m.playerId) === String(playerId)) return m;
        changed = true;
        return { ...m, playerId };
      });
      return changed ? next : prev;
    });
  }, [playerId]);

  const roomMax = mode === 'online' ? ONLINE_ROOM_MAX : ROOM_MAX;

  /** 온라인: 방 문서의 방장 진행도·보너스·마스터 여부 — 오프라인: 본인 회원 데이터 */
  const unlockedPackKeys = useMemo(() => {
    if (mode === 'online' && roomId && remoteRoom) {
      const hp =
        remoteRoom.hostPackProgress && typeof remoteRoom.hostPackProgress === 'object'
          ? remoteRoom.hostPackProgress
          : {};
      const bonus = Array.isArray(remoteRoom.hostPackUnlockBonus) ? remoteRoom.hostPackUnlockBonus : [];
      const hostPurchased = filterValidPurchasedPackKeys(
        Array.isArray(remoteRoom.hostPurchasedPackKeys) ? remoteRoom.hostPurchasedPackKeys : []
      );
      const hostAll = remoteRoom.hostIsMaster === true;
      return getUnlockedPackKeys({
        isGuest: false,
        packProgress: hp,
        packUnlockBonus: bonus,
        purchasedPackKeys: hostPurchased,
        isMaster: hostAll,
      });
    }
    return getUnlockedPackKeys({
      isGuest,
      packProgress,
      packUnlockBonus,
      purchasedPackKeys: filterValidPurchasedPackKeys(purchasedPackKeys),
      isMaster: Boolean(!isGuest && isMaster),
    });
  }, [
    isGuest,
    isMaster,
    packProgress,
    packUnlockBonus,
    purchasedPackKeys,
    mode,
    roomId,
    remoteRoom,
  ]);

  useEffect(() => {
    if (!unlockedPackKeys.has(selectedPackKey)) {
      const first =
        PACK_UNLOCK_ORDER.find((k) => unlockedPackKeys.has(k)) || 'kindergarten';
      setSelectedPackKey(first);
    }
  }, [unlockedPackKeys, selectedPackKey, setSelectedPackKey]);

  useEffect(() => {
    guestPlayStartedRef.current = false;
    seenSelfInMembersRef.current = false;
    if (roomId == null) kickBlockedUntilRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    setNameDraft(playerName);
  }, [playerName]);

  /** 플레이에서 온라인 퇴장 시: sessionStorage·로컬 roomId 정리 (같은 방 자동 재입장 루프 방지) */
  useEffect(() => {
    const onLeft = () => {
      guestPlayStartedRef.current = false;
      setRoomId(null);
      setRemoteRoom(null);
      setIsHost(false);
      setHostPlayerId(null);
    };
    window.addEventListener('sisort-left-online-room', onLeft);
    return () => window.removeEventListener('sisort-left-online-room', onLeft);
  }, []);

  /** 온라인 방장: 내 팩 진행도·보너스·마스터 여부를 방 문서에 두어 참가자와 동기화 */
  useEffect(() => {
    if (!db || !roomId || !isHost || mode !== 'online' || !remoteRoom) return;
    const prev = remoteRoom.hostPackProgress && typeof remoteRoom.hostPackProgress === 'object'
      ? remoteRoom.hostPackProgress
      : {};
    const prevBonus = Array.isArray(remoteRoom.hostPackUnlockBonus) ? remoteRoom.hostPackUnlockBonus : [];
    const nextBonus = Array.isArray(packUnlockBonus) ? packUnlockBonus : [];
    const prevPurchased = filterValidPurchasedPackKeys(
      Array.isArray(remoteRoom.hostPurchasedPackKeys) ? remoteRoom.hostPurchasedPackKeys : []
    );
    const nextPurchased = filterValidPurchasedPackKeys(purchasedPackKeys);
    const prevMaster = remoteRoom.hostIsMaster === true;
    const nextMaster = Boolean(isMaster && !isGuest);
    if (
      JSON.stringify(prev) === JSON.stringify(packProgress || {})
      && JSON.stringify(prevBonus) === JSON.stringify(nextBonus)
      && JSON.stringify(prevPurchased) === JSON.stringify(nextPurchased)
      && prevMaster === nextMaster
    ) {
      return;
    }
    updateDoc(doc(db, 'rooms', roomId), {
      hostPackProgress: packProgress,
      hostPackUnlockBonus: nextBonus,
      hostPurchasedPackKeys: nextPurchased,
      hostIsMaster: nextMaster,
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  }, [db, roomId, isHost, mode, remoteRoom, packProgress, packUnlockBonus, purchasedPackKeys, isMaster, isGuest]);

  /** 명예의 전당 실시간 구독(로그인 여부와 무관하게 읽기 전용) */
  useEffect(() => {
    if (!db) {
      setHallOfFame({});
      return undefined;
    }
    const col = collection(db, 'hallOfFame');
    return onSnapshot(
      col,
      (snap) => {
        const next = {};
        snap.forEach((d) => {
          next[d.id] = d.data();
        });
        setHallOfFame(next);
      },
      () => setHallOfFame({})
    );
  }, [db]);

  useEffect(() => {
    setLocalMembers((prev) =>
      prev.map((m) => (m.playerId === playerId && !m.isAI ? { ...m, name: playerName } : m))
    );
  }, [playerName, playerId]);

  /** 온라인: 방 생성 후에는 Firestore 멤버, 그 전에는 로컬에서 인원 구성 */
  const members = useMemo(() => {
    if (mode === 'online' && remoteRoom?.members?.length) return remoteRoom.members;
    return localMembers;
  }, [mode, remoteRoom, localMembers]);

  const hostMemberLabel = useMemo(() => {
    const hid = remoteRoom?.hostId;
    if (!hid || !members?.length) return null;
    const hm = members.find((m) => m && String(m.playerId) === String(hid));
    return hm?.name ?? '방장';
  }, [remoteRoom?.hostId, members]);

  useEffect(() => {
    if (!onlineOk || !roomId || mode !== 'online') {
      setRemoteRoom(null);
      return undefined;
    }
    const ref = doc(db, 'rooms', roomId);
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setRemoteRoom(null);
        return;
      }
      const data = { id: snap.id, ...snap.data() };
      const list = Array.isArray(data.members) ? data.members : [];
      const memberIsSelf = (m) =>
        m && m.playerId != null && String(m.playerId) === String(playerId);
      const inList = list.some(memberIsSelf);
      if (inList) seenSelfInMembersRef.current = true;

      const isRoomHostDoc = data.hostId != null && String(data.hostId) === String(playerId);
      const kickAllowed = Date.now() >= kickBlockedUntilRef.current;
      /* 실제 추방: 이전에 본인이 목록에 있었는데 로비에서 빠진 경우만 (참가 직후 레이스·캐시 오인 제거) */
      if (
        roomId &&
        data.phase === 'lobby' &&
        list.length > 0 &&
        !inList &&
        seenSelfInMembersRef.current &&
        !isRoomHostDoc &&
        kickAllowed
      ) {
        setErr('방에서 추방되었습니다.');
        setRoomId(null);
        setRemoteRoom(null);
        setIsHost(false);
        setHostPlayerId(null);
        guestPlayStartedRef.current = false;
        return;
      }
      setRemoteRoom(data);
      if (data.phase === 'lobby') {
        guestPlayStartedRef.current = false;
      }
      if (data.phase === 'playing' && !isHost && !guestPlayStartedRef.current) {
        const myIdx = list.findIndex(memberIsSelf);
        if (myIdx < 0) return;
        guestPlayStartedRef.current = true;
        joinOnlineAsGuest({
          db,
          roomId,
          members: list,
          mySlot: myIdx,
          playerId,
          hostPlayerId: data.hostId,
        });
        onStartPlay();
      }
    });
  }, [onlineOk, db, roomId, mode, isHost, playerId, joinOnlineAsGuest, onStartPlay]);

  const totalCount = members.length;
  const canStart =
    totalCount >= ROOM_MIN && totalCount <= roomMax;

  const addAiOffline = () => {
    if (localMembers.length >= roomMax) return;
    setLocalMembers((prev) => [
      ...prev,
      { playerId: `ai-${Date.now()}-${prev.length}`, name: `AI ${prev.filter((m) => m?.isAI).length + 1}`, isAI: true },
    ]);
  };

  const removeAiOffline = () => {
    setLocalMembers((prev) => {
      const idx = [...prev].map((m, i) => (m?.isAI ? i : -1)).filter((i) => i >= 0).pop();
      if (idx === undefined || prev.length <= ROOM_MIN) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addAiOnline = async () => {
    if (!onlineOk || !roomId || !isHost || !remoteRoom) return;
    if (members.length >= ONLINE_ROOM_MAX) return;
    const next = [
      ...members,
      { playerId: `ai-${Date.now()}`, name: `AI ${members.filter((m) => m?.isAI).length + 1}`, isAI: true },
    ];
    setBusy(true);
    setErr('');
    try {
      await ensureFirebaseAuth();
      await updateRoomMembers(db, roomId, next, hostPlayerId);
    } catch (e) {
      setErr('AI 추가 실패');
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const removeAiOnline = async () => {
    if (!onlineOk || !roomId || !isHost || !remoteRoom) return;
    const idx = members.map((m, i) => (m?.isAI ? i : -1)).filter((i) => i >= 0).pop();
    if (idx === undefined || members.length <= ROOM_MIN) return;
    const next = members.filter((_, i) => i !== idx);
    setBusy(true);
    try {
      await ensureFirebaseAuth();
      await updateRoomMembers(db, roomId, next, hostPlayerId);
    } catch (e) {
      setErr('AI 제거 실패');
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const syncPackOnline = async (key) => {
    if (!unlockedPackKeys.has(key)) return;
    setSelectedPackKey(key);
    if (!onlineOk || !roomId || !isHost) return;
    try {
      await ensureFirebaseAuth();
      await updateDoc(doc(db, 'rooms', roomId), { packKey: key, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error(e);
      setErr('단어 수준 동기화에 실패했습니다.');
    }
  };

  const handleCreateRoom = async () => {
    if (!onlineOk) return;
    const code = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(code)) {
      setErr('방 코드는 영문 대문자·숫자 4자리입니다.');
      return;
    }
    if (localMembers.length < ROOM_MIN || localMembers.length > ONLINE_ROOM_MAX) {
      setErr(`온라인 방은 ${ROOM_MIN}~${ONLINE_ROOM_MAX}명으로 맞춰 주세요.`);
      return;
    }
    setBusy(true);
    setErr('');
    try {
      /* 게스트는 로컬 playerId와 익명 uid가 달라서, 인증 직후 uid로 방·멤버를 맞춰야 방장 판정·시작이 됩니다 */
      const authUser = await ensureFirebaseAuth();
      const uid = authUser.uid;
      const membersForRoom = localMembers.map((m) =>
        m.isAI ? m : { ...m, playerId: uid }
      );
      await createRoomDoc(db, code, {
        hostId: uid,
        packKey: selectedPackKey,
        members: membersForRoom,
        hostPackProgress: packProgress,
        hostPackUnlockBonus: Array.isArray(packUnlockBonus) ? packUnlockBonus : [],
        hostPurchasedPackKeys: filterValidPurchasedPackKeys(purchasedPackKeys),
        hostIsMaster: Boolean(isMaster && !isGuest),
      });
      setLocalMembers(membersForRoom);
      setRoomId(code);
      setIsHost(true);
      setHostPlayerId(uid);
      setMode('online');
      seenSelfInMembersRef.current = true;
      kickBlockedUntilRef.current = Date.now() + 20000;
    } catch (e) {
      console.error(e);
      if (e?.message === 'ROOM_ALREADY_EXISTS') {
        setErr('이미 같은 이름의 방이 있습니다. 다른 코드를 쓰거나 참가를 눌러 주세요.');
      } else {
        const msg = e?.code === 'auth/operation-not-allowed'
          ? 'Firebase 콘솔에서 익명 로그인을 켜 주세요.'
          : e?.message || '';
        setErr(msg ? `방 만들기에 실패했습니다. (${msg})` : '방 만들기에 실패했습니다.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!onlineOk) return;
    const code = normalizeRoomCode(roomCode);
    if (!isValidRoomCode(code)) {
      setErr('방 코드 4자리를 입력하세요.');
      return;
    }
    if (roomId === code) {
      setErr('이미 이 방에 연결되어 있습니다.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const authUser = await ensureFirebaseAuth();
      const uid = authUser.uid;
      await joinRoomDoc(db, code, { playerId: uid, name: playerName, isAI: false });
      setLocalMembers((prev) =>
        prev.map((m) => (m.isAI ? m : { ...m, playerId: uid }))
      );
      setRoomId(code);
      setIsHost(false);
      setHostPlayerId(null);
      setMode('online');
      kickBlockedUntilRef.current = Date.now() + 25000;
    } catch (e) {
      console.error(e);
      if (e.message === 'ROOM_NOT_FOUND') setErr('방을 찾을 수 없습니다.');
      else if (e.message === 'GAME_ALREADY_STARTED') setErr('이미 시작된 방입니다.');
      else if (e.message === 'ROOM_FULL') setErr(`방이 가득 찼습니다. (온라인 최대 ${ONLINE_ROOM_MAX}명)`);
      else setErr('참가에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartOffline = () => {
    if (!canStart) return;
    const saved = loadOfflineRunSave();
    if (
      saved &&
      saved.packKey === selectedPackKey &&
      saved.nextLevel >= 1 &&
      saved.nextLevel <= TOTAL_LEVELS
    ) {
      if (window.confirm('저장된 오프라인 진행이 있습니다. 이어서 하시겠습니까?')) {
        resumeOfflineRun(localMembers, selectedPackKey, playerId, saved);
        onStartPlay();
        return;
      }
      if (!window.confirm('새로 시작하면 저장된 진행이 삭제될 수 있습니다. 계속하시겠습니까?')) {
        return;
      }
      clearOfflineRunSave();
    }
    startOfflineFromLobby(localMembers, selectedPackKey, playerId);
    onStartPlay();
  };

  const handleStartOnline = async () => {
    if (!onlineOk || !roomId || !isHost || !remoteRoom || !canStart) return;
    setBusy(true);
    setErr('');
    try {
      await ensureFirebaseAuth();
      await beginOnlineHostGame({
        db,
        roomId,
        members: remoteRoom.members,
        mySlot: remoteRoom.members.findIndex((m) => m.playerId === playerId),
        packKey: remoteRoom.packKey || selectedPackKey,
        hostPlayerId: playerId,
        playerId,
      });
      onStartPlay();
    } catch (e) {
      console.error(e);
      setErr('게임 시작에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleKickMember = async (targetPlayerId) => {
    if (!onlineOk || !roomId || !isHost || !hostPlayerId || targetPlayerId === playerId) return;
    setBusy(true);
    setErr('');
    try {
      await ensureFirebaseAuth();
      await kickMemberFromRoom(db, roomId, hostPlayerId, targetPlayerId);
    } catch (e) {
      setErr('추방에 실패했습니다.');
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDisplayName = async () => {
    const t = nameDraft.trim();
    if (t.length < 2) {
      setErr('표시 이름은 2자 이상으로, 반드시 본인을 알아볼 수 있는 이름을 넣어 주세요.');
      return;
    }
    safeSetItem('sisort_name', t);
    setPlayerName(t);
    setLocalMembers((prev) =>
      prev.map((m) => (m.playerId === playerId && !m.isAI ? { ...m, name: t } : m))
    );
    setErr('');
    if (onlineOk && roomId) {
      setBusy(true);
      try {
        await ensureFirebaseAuth();
        await updatePlayerNameInRoom(db, roomId, playerId, t);
      } catch (e) {
        setErr('서버에 이름 반영에 실패했습니다. 로컬만 변경되었습니다.');
        console.error(e);
      } finally {
        setBusy(false);
      }
    }
    if (!isGuest && authUid) {
      try {
        await updateUserShownName(authUid, t);
      } catch (e) {
        console.error('[shownName]', e);
      }
    }
    setShowNameEdit(false);
  };

  const canDeleteAccount =
    onlineOk &&
    Boolean(authUid) &&
    !isGuest &&
    typeof authEmail === 'string' &&
    authEmail.length > 0 &&
    !isMasterAccountEmail(authEmail);

  return (
    <div className={`relative min-h-screen text-white font-sans ${onlineOk ? 'pb-28 lg:pb-10' : 'pb-10'}`}>
      <KoreanThemeBackdrop />
      <div className="relative z-10">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-5">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700/50 pb-3 pt-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-teal-400/90">한글 · 사전 순 게임</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white sm:text-3xl">침묵의 가나다</h1>
            <p className="mt-1 max-w-md text-[13px] leading-snug text-slate-400 break-keep">
              <span className="font-semibold text-slate-300">{playerName}</span>님 · 방 {ROOM_MIN}~{roomMax}명
              {mode === 'online' ? ` · 온라인 최대 ${ONLINE_ROOM_MAX}명` : ''}
              {isGuest && (
                <span className="mt-1 block text-amber-300/95 text-xs">게스트: 유치원·6학년 사회 팩 이용</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setNameDraft(playerName);
                setShowNameEdit(true);
              }}
              className="rounded-full border border-slate-600 bg-slate-800/90 px-3 py-1.5 text-[11px] font-bold text-sky-200 hover:bg-slate-700/90 touch-manipulation"
            >
              이름 수정
            </button>
            {onOpenMyStats && (
              <button
                type="button"
                onClick={onOpenMyStats}
                className="rounded-full border border-sky-600/60 bg-sky-950/80 px-3 py-1.5 text-[11px] font-bold text-sky-100 touch-manipulation"
              >
                내 기록
              </button>
            )}
            {onOpenAdmin && (
              <button
                type="button"
                onClick={onOpenAdmin}
                className="rounded-full border border-amber-600/60 bg-amber-950/80 px-3 py-1.5 text-[11px] font-bold text-amber-100 touch-manipulation"
              >
                관리자
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={() => void onLogout()}
                className="rounded-full bg-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-200 touch-manipulation"
              >
                {logoutLabel}
              </button>
            )}
            {canDeleteAccount && (
              <button
                type="button"
                onClick={() => setAccountDeleteOpen(true)}
                className="rounded-full border border-rose-700/70 bg-rose-950/70 px-3 py-1.5 text-[11px] font-bold text-rose-200 touch-manipulation"
              >
                계정 삭제
              </button>
            )}
          </div>
        </header>

        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div
          className={`flex min-w-0 flex-1 flex-col ${
            onlineOk && lobbyTab === 'hall' ? 'hidden lg:flex' : ''
          }`}
        >
      <div className="mx-auto flex w-full max-w-lg flex-col items-stretch">
      <section
        className="mb-4 w-full rounded-3xl border border-teal-500/30 bg-gradient-to-b from-slate-800/95 to-slate-950/90 p-4 shadow-xl shadow-black/30 sm:p-5"
        aria-label="학습 시작"
      >
        <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-teal-300/90">플레이 모드</p>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl border border-slate-700/90 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => {
              setMode('offline');
              setRoomId(null);
              clearRoomSession();
              setErr('');
            }}
            className={`rounded-xl py-2.5 text-sm font-black transition touch-manipulation ${
              mode === 'offline' ? 'bg-teal-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            오프라인
          </button>
          <button
            type="button"
            disabled={!onlineOk}
            onClick={() => {
              setMode('online');
              setErr('');
            }}
            className={`rounded-xl py-2.5 text-sm font-black transition touch-manipulation ${
              mode === 'online' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
            } ${!onlineOk ? 'cursor-not-allowed opacity-40' : ''}`}
          >
            온라인
          </button>
        </div>
        <LobbyPrimaryCta
          mode={mode}
          isHost={isHost}
          roomId={roomId}
          canStart={canStart}
          busy={busy}
          remoteRoom={remoteRoom}
          onStartOffline={handleStartOffline}
          onStartOnline={handleStartOnline}
          onCreateOnlineRoom={onlineOk ? () => void handleCreateRoom() : undefined}
        />
      </section>

      <details className="mb-4 w-full rounded-3xl border border-sky-700/40 bg-sky-950/25 p-4 text-left open:bg-sky-950/35">
        <summary className="cursor-pointer list-none text-sm font-bold text-sky-200 [&::-webkit-details-marker]:hidden">
          <span className="text-sky-400/90">▼</span> 시작 전 안내 (탭하여 펼치기)
        </summary>
        <ul className="mt-3 space-y-1.5 pl-1 text-[12px] text-slate-300 break-keep">
          <li>인원을 {ROOM_MIN}~{roomMax}명으로 맞춘 뒤, 단어 수준(팩)을 고릅니다.</li>
          <li>
            <strong className="text-white">오프라인</strong>: 위 <strong className="text-white">빠른 시작</strong>으로 바로 들어가거나, 인원·팩을 맞춘 뒤 아래에서 다시 시작할 수 있습니다.
          </li>
          <li>
            <strong className="text-white">온라인</strong>: 맨 아래 <strong className="text-white">방 코드</strong>로 참가하거나 방을 만든 다음, 방장이 단어 수준을 정하고 시작합니다.
          </li>
        </ul>
      </details>

      {err && <p className="text-red-400 mb-2 w-full text-center text-sm">{err}</p>}

      <div className="mb-4 w-full rounded-3xl border border-slate-600/70 bg-slate-800/80 p-4 shadow-lg shadow-black/20 sm:p-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-amber-200/80">단어 수준</p>
        <h3 className="sr-only">단어 수준 선택</h3>
        <p className="text-[11px] text-slate-500 mb-2 break-keep">
          {!isGuest &&
            '회원: 유치원 팩부터 순서대로 열립니다. 이전 팩 7레벨 클리어 시 다음 팩이 열리며, 표시된 팩은 스토어 구매로 먼저 열 수 있습니다. 진행도·기록은 오프라인 나+가상 1명 방 조건일 때만 반영됩니다.'}
        </p>
        {mode === 'online' && roomId && (
          <p className="text-[11px] text-emerald-300/90 mb-2 break-keep">
            온라인: 방장 계정으로 해금된 단어 수준은 이 방에 참가한 모두가 선택할 수 있습니다.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(PACK_DATA).map(([key, pack]) => {
            const locked = !unlockedPackKeys.has(key);
            const iap = isPackInAppPurchasable(key);
            const iapLabel = iap ? PACK_IAP_BY_PACK_ID[key]?.priceLabel || '인앱' : '';
            return (
              <button
                key={key}
                type="button"
                title={
                  locked
                    ? iap
                      ? '진행 클리어 또는 스토어 구매로 해제'
                      : '이전 팩 7레벨 클리어 시 해제 (게스트는 일부 팩만)'
                    : pack.name
                }
                onClick={() => {
                  if (locked) return;
                  if (mode === 'online' && isHost && onlineOk) void syncPackOnline(key);
                  else setSelectedPackKey(key);
                }}
                disabled={locked || (mode === 'online' && roomId && !isHost)}
                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-2 text-center text-xs font-bold leading-tight sm:text-sm ${
                  selectedPackKey === key ? 'bg-amber-400 text-slate-900 shadow-md' : 'bg-slate-700/90 text-slate-100'
                } ${mode === 'online' && roomId && !isHost ? 'opacity-60' : ''} ${
                  locked ? 'cursor-not-allowed opacity-40' : 'touch-manipulation active:scale-[0.98]'
                } ${locked && iap ? 'line-through decoration-amber-400/50' : ''}`}
              >
                <span className="break-keep">
                  {locked ? '🔒 ' : ''}
                  {pack.name}
                </span>
                {locked && iap && (
                  <span className="text-[9px] font-black uppercase tracking-wide text-amber-300/95 no-underline">
                    {iapLabel} · 스토어
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {import.meta.env.DEV && authUid && !isGuest && (
          <details className="mt-3 rounded-xl border border-amber-700/50 bg-amber-950/30 p-2">
            <summary className="cursor-pointer text-[11px] font-bold text-amber-200">
              개발: 구매 해금 시뮬레이션
            </summary>
            <p className="mt-1 text-[10px] text-amber-200/80 break-keep">
              프로덕션에서는 스토어 검증 후 서버에서만 purchasedPackKeys 를 쓰는 것을 권장합니다.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(PACK_IAP_BY_PACK_ID).map((pk) => (
                <button
                  key={pk}
                  type="button"
                  onClick={() =>
                    void (async () => {
                      try {
                        await devSimulatePurchase(authUid, pk);
                        await onRefreshPackEconomy?.();
                      } catch (er) {
                        setErr(er?.message || String(er));
                      }
                    })()
                  }
                  className="rounded-lg bg-amber-900/90 px-2 py-1 text-[10px] font-bold text-amber-50 touch-manipulation"
                >
                  + {pk}
                </button>
              ))}
            </div>
          </details>
        )}
      </div>

      <div className="mb-4 w-full rounded-3xl border border-slate-600/70 bg-slate-800/80 p-4 shadow-lg shadow-black/20 sm:p-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-300/90">참가자</p>
          <span className="rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-xs font-black text-emerald-200 tabular-nums">
            {totalCount}명
          </span>
        </div>
        <h3 className="sr-only">참가자 목록</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (mode === 'online' && roomId && isHost) void addAiOnline();
                else addAiOffline();
              }}
              disabled={
                busy ||
                totalCount >= roomMax ||
                (mode === 'online' && roomId && !isHost)
              }
              className="rounded-xl bg-emerald-800 px-3 py-1.5 text-xs font-bold touch-manipulation"
            >
              + AI
            </button>
            <button
              type="button"
              onClick={() => {
                if (mode === 'online' && roomId && isHost) void removeAiOnline();
                else removeAiOffline();
              }}
              disabled={
                busy ||
                totalCount <= ROOM_MIN ||
                (mode === 'online' && roomId && !isHost)
              }
              className="rounded-xl bg-slate-600 px-3 py-1.5 text-xs font-bold touch-manipulation"
            >
              − AI
            </button>
          </div>
        </div>
        <ul className="space-y-1 text-sm">
          {(Array.isArray(members) ? members : []).map((m, i) => {
            if (!m) return null;
            const isHostMember =
              mode === 'online' &&
              roomId &&
              remoteRoom?.hostId != null &&
              String(remoteRoom.hostId) === String(m.playerId);
            return (
            <li key={`${m.playerId}-${i}`} className="flex justify-between items-center gap-2 border-b border-slate-700/80 py-1">
              <span>
                {m.isAI ? '🤖' : '👤'} {m.name}
                {isHostMember && (
                  <span className="ml-2 text-amber-300 text-xs font-bold">방장</span>
                )}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                {m.playerId === playerId && <span className="text-slate-500">(나)</span>}
                {mode === 'online' &&
                  roomId &&
                  isHost &&
                  !m.isAI &&
                  m.playerId !== playerId &&
                  m.playerId !== hostPlayerId && (
                    <button
                      type="button"
                      onClick={() => void handleKickMember(m.playerId)}
                      disabled={busy}
                      className="rounded bg-rose-900/80 px-2 py-0.5 text-[11px] font-bold text-rose-100 disabled:opacity-40"
                    >
                      추방
                    </button>
                  )}
              </span>
            </li>
            );
          })}
        </ul>
        {!canStart && (
          <p className="mt-2 text-xs text-amber-400">
            {ROOM_MIN}~{roomMax}명으로 맞춰 주세요.
          </p>
        )}
        <div className="mt-4 border-t border-slate-700/80 pt-4">
          <p className="mb-2 text-center text-[11px] text-slate-500 break-keep">인원·팩을 바꾼 뒤 여기서도 바로 시작할 수 있어요</p>
          <LobbyPrimaryCta
            mode={mode}
            isHost={isHost}
            roomId={roomId}
            canStart={canStart}
            busy={busy}
            remoteRoom={remoteRoom}
            onStartOffline={handleStartOffline}
            onStartOnline={handleStartOnline}
            onCreateOnlineRoom={onlineOk ? () => void handleCreateRoom() : undefined}
            compact
          />
        </div>
      </div>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="min-h-[44px] rounded-2xl border border-slate-600 bg-slate-800/90 px-5 py-2.5 text-sm font-bold text-slate-200 touch-manipulation"
        >
          게임 방법
        </button>
        <button
          type="button"
          onClick={() => setShowWordList(true)}
          className="min-h-[44px] rounded-2xl border border-emerald-700/50 bg-emerald-950/60 px-5 py-2.5 text-sm font-bold text-emerald-100 touch-manipulation"
        >
          족보 단어장
        </button>
      </div>

      <div className="mb-6 mt-1 w-full rounded-3xl border border-slate-600/70 bg-slate-800/80 p-4 shadow-md sm:p-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">온라인 방</p>
        <label className="mb-1 block text-xs text-slate-400">방 코드 (4자리 · 대문자·숫자)</label>
        {mode === 'online' && onlineOk ? (
          <form
            className="flex flex-wrap gap-2 items-center"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void handleJoinRoom();
            }}
          >
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
              maxLength={4}
              autoComplete="off"
              className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-center text-xl font-semibold uppercase tracking-widest tabular-nums"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-bold disabled:opacity-40"
            >
              참가
            </button>
            <button
              type="button"
              onClick={() => void handleCreateRoom()}
              disabled={busy || !canStart}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold disabled:opacity-40"
            >
              방 만들기
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2 items-center opacity-60">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
              maxLength={4}
              disabled
              className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-center text-xl font-semibold uppercase tracking-widest tabular-nums"
            />
            <span className="text-[11px] text-slate-500">온라인 모드에서만 사용합니다.</span>
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">참가 입력 후 Enter 키로 참가할 수 있습니다.</p>
        {mode === 'online' && roomId && (
          <div className="text-emerald-400 text-sm mt-3 space-y-0.5 border-t border-slate-700 pt-3">
            <p>
              연결된 방: <strong>{roomId}</strong> {isHost ? '(나 — 방장)' : '(참가자)'}
            </p>
            {!isHost && hostMemberLabel && (
              <p className="text-amber-200/95 text-xs">
                방장: <strong>{hostMemberLabel}</strong>
              </p>
            )}
            {isHost && <p className="text-amber-200/95 text-xs">이 방의 방장은 나입니다.</p>}
          </div>
        )}
      </div>

      </div>

        {onlineOk && (
          <aside className="hidden lg:block w-80 shrink-0 lg:sticky lg:top-4 self-start">
            <HallOfFamePanel hallOfFame={hallOfFame} PACK_DATA={PACK_DATA} />
          </aside>
        )}
        {onlineOk && (
          <div className={`lg:hidden w-full pb-4 ${lobbyTab === 'hall' ? 'block' : 'hidden'}`}>
            <HallOfFamePanel hallOfFame={hallOfFame} PACK_DATA={PACK_DATA} />
          </div>
        )}
      </div>

      <footer
        className={`mt-6 w-full border-t border-slate-800/80 pt-6 pb-4 text-center ${
          onlineOk ? 'mb-24 lg:mb-8' : 'mb-6'
        }`}
      >
        <LegalFooterLinks />
      </footer>
      </div>

      {onlineOk && (
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 flex border-t border-slate-700 bg-slate-900/95 backdrop-blur-md"
          aria-label="로비 메뉴"
        >
          <button
            type="button"
            onClick={() => setLobbyTab('main')}
            className={`flex-1 py-3.5 text-sm font-black transition ${
              lobbyTab === 'main'
                ? 'text-amber-300 border-t-2 border-amber-400 bg-slate-800/90'
                : 'text-slate-500'
            }`}
          >
            로비
          </button>
          <button
            type="button"
            onClick={() => setLobbyTab('hall')}
            className={`flex-1 py-3.5 text-sm font-black transition ${
              lobbyTab === 'hall'
                ? 'text-amber-300 border-t-2 border-amber-400 bg-slate-800/90'
                : 'text-slate-500'
            }`}
          >
            명예의 전당
          </button>
        </nav>
      )}

      <AccountDeleteModal
        open={accountDeleteOpen}
        onClose={() => setAccountDeleteOpen(false)}
        onDeleted={(uid) => {
          setAccountDeleteOpen(false);
          onAccountDeleted?.(uid);
        }}
      />

      {showRules && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="pointer-events-auto max-h-[85vh] w-full max-w-lg">
            <DraggablePanel className="max-h-[80vh] overflow-hidden rounded-2xl border border-slate-600 bg-slate-800 shadow-2xl">
              <div className="max-h-[calc(80vh-2rem)] overflow-y-auto p-6">
                <h2 className="text-2xl font-bold text-yellow-400 mb-4">게임 방법</h2>
                <ul className="text-slate-300 space-y-2 text-sm list-disc pl-5">
                  <li>모든 플레이어는 카드를 받고, 가나다순으로 내야 합니다.</li>
                  <li>AI는 자동으로 타이밍에 맞춰 냅니다.</li>
                  <li>온라인에서는 호스트가 타이머·AI를 맞춥니다.</li>
                  <li>살펴보기·대기 중에는 [가나다 한번에 정렬] 버튼 또는 드래그로 순서를 맞출 수 있습니다. 사전 순과 다르면 빨간 테두리로 표시됩니다.</li>
                </ul>
                <button type="button" onClick={() => setShowRules(false)} className="mt-6 w-full rounded-xl bg-blue-600 py-3 font-bold">
                  닫기
                </button>
              </div>
            </DraggablePanel>
          </div>
        </div>
      )}

      <JokboWordListModal
        open={showWordList}
        packTitle={PACK_DATA[selectedPackKey]?.name ?? '단어'}
        currentWordDB={currentWordDB}
        onClose={() => setShowWordList(false)}
      />

      {showNameEdit && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="pointer-events-auto w-full max-w-md">
            <DraggablePanel className="rounded-2xl border border-slate-600 bg-slate-800 shadow-2xl">
              <div className="p-6">
            <h2 className="text-xl font-bold text-sky-300 mb-3">표시 이름</h2>
            <p className="text-slate-400 text-xs mb-2 break-keep">
              게임·명예의 전당·길라잡이 안내에 쓰이므로, <strong className="text-sky-200">반드시 본인을 알아볼 수 있는 이름</strong>
              을 2자 이상 넣어 주세요. 온라인 방에 있으면 다른 참가자에게도 반영됩니다.
            </p>
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              className="w-full rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 mb-4"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowNameEdit(false)}
                className="flex-1 rounded-xl bg-slate-600 py-2 font-bold"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleSaveDisplayName()}
                disabled={busy}
                className="flex-1 rounded-xl bg-sky-600 py-2 font-bold disabled:opacity-40"
              >
                저장
              </button>
            </div>
              </div>
            </DraggablePanel>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
