import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import JokboWordListModal from './JokboWordListModal.jsx';
import { getFirestoreDb, isFirebaseConfigured, ensureFirebaseAuth } from '../lib/firebase.js';
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
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from '../lib/roomCode.js';

/**
 * 로비: 4자 방 코드, 멀티플레이(Firebase), 오프라인, AI 인원 조절
 */
export default function LobbyScreen({
  game,
  playerName,
  playerId,
  setPlayerName,
  onStartPlay,
}) {
  const {
    PACK_DATA,
    selectedPackKey,
    setSelectedPackKey,
    beginOnlineHostGame,
    joinOnlineAsGuest,
    startOfflineFromLobby,
    currentWordDB,
    showRules,
    setShowRules,
    showWordList,
    setShowWordList,
  } = game;

  const db = getFirestoreDb();
  const onlineOk = isFirebaseConfigured() && db;

  const [roomCode, setRoomCode] = useState(() => randomRoomCode());
  const [mode, setMode] = useState('online'); // offline | online — 기본: 온라인 방
  const [roomId, setRoomId] = useState(null);
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

  /** 로컬 오프라인 멤버 (1인 + AI) — useState는 이펙트보다 위에 두어 훅 순서를 맞춤 */
  const [localMembers, setLocalMembers] = useState(() => [
    { playerId, name: playerName, isAI: false },
    { playerId: `ai-${Date.now()}`, name: 'AI 1', isAI: true },
  ]);

  const roomMax = mode === 'online' ? ONLINE_ROOM_MAX : ROOM_MAX;

  useEffect(() => {
    guestPlayStartedRef.current = false;
    seenSelfInMembersRef.current = false;
    if (roomId == null) kickBlockedUntilRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    setNameDraft(playerName);
  }, [playerName]);

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
      { playerId: `ai-${Date.now()}-${prev.length}`, name: `AI ${prev.filter((m) => m.isAI).length + 1}`, isAI: true },
    ]);
  };

  const removeAiOffline = () => {
    setLocalMembers((prev) => {
      const idx = [...prev].map((m, i) => (m.isAI ? i : -1)).filter((i) => i >= 0).pop();
      if (idx === undefined || prev.length <= ROOM_MIN) return prev;
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addAiOnline = async () => {
    if (!onlineOk || !roomId || !isHost || !remoteRoom) return;
    if (members.length >= ONLINE_ROOM_MAX) return;
    const next = [
      ...members,
      { playerId: `ai-${Date.now()}`, name: `AI ${members.filter((m) => m.isAI).length + 1}`, isAI: true },
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
    const idx = members.map((m, i) => (m.isAI ? i : -1)).filter((i) => i >= 0).pop();
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
      await ensureFirebaseAuth();
      await createRoomDoc(db, code, {
        hostId: playerId,
        packKey: selectedPackKey,
        members: localMembers,
      });
      setRoomId(code);
      setIsHost(true);
      setHostPlayerId(playerId);
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
      await ensureFirebaseAuth();
      await joinRoomDoc(db, code, { playerId, name: playerName, isAI: false });
      setRoomId(code);
      setIsHost(false);
      setHostPlayerId(null);
      setMode('online');
      kickBlockedUntilRef.current = Date.now() + 25000;
    } catch (e) {
      console.error(e);
      if (e.message === 'ROOM_NOT_FOUND') setErr('방을 찾을 수 없습니다.');
      else if (e.message === 'GAME_ALREADY_STARTED') setErr('이미 시작된 방입니다.');
      else if (e.message === 'ROOM_FULL') setErr('방이 가득 찼습니다. (온라인 최대 4명)');
      else setErr('참가에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartOffline = () => {
    if (!canStart) return;
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
    if (!t) {
      setErr('이름을 입력해 주세요.');
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
    setShowNameEdit(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-4 text-white font-sans pb-24">
      <h1 className="text-4xl md:text-5xl font-black mt-6 mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        침묵의 가나다
      </h1>
      <p className="text-slate-400 text-sm mb-2 text-center">
        {playerName}님 — 방 {ROOM_MIN}~{roomMax}명
        {mode === 'online' ? ' (온라인 최대 4명)' : ''}
      </p>
      <button
        type="button"
        onClick={() => { setNameDraft(playerName); setShowNameEdit(true); }}
        className="text-xs text-sky-400 hover:underline mb-6"
      >
        표시 이름 바꾸기
      </button>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => { setMode('offline'); setRoomId(null); setErr(''); }}
          className={`rounded-full px-4 py-2 font-bold ${mode === 'offline' ? 'bg-blue-600' : 'bg-slate-700'}`}
        >
          오프라인
        </button>
        <button
          type="button"
          disabled={!onlineOk}
          onClick={() => { setMode('online'); setErr(''); }}
          className={`rounded-full px-4 py-2 font-bold ${mode === 'online' ? 'bg-emerald-600' : 'bg-slate-700'} ${!onlineOk ? 'opacity-40' : ''}`}
        >
          온라인 방
        </button>
      </div>

      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-4 mb-4">
        <label className="block text-xs text-slate-400 mb-1">방 이름 (4자리 · 대문자·숫자)</label>
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
              className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-center tracking-widest text-xl font-mono uppercase"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-bold disabled:opacity-40 order-2 sm:order-1"
            >
              참가
            </button>
            <button
              type="button"
              onClick={() => void handleCreateRoom()}
              disabled={busy || !canStart}
              className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold disabled:opacity-40 order-3 sm:order-2"
            >
              방 만들기
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
              maxLength={4}
              className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-center tracking-widest text-xl font-mono uppercase"
            />
          </div>
        )}
        <p className="text-[11px] text-slate-500 mt-1.5">Enter 키는 참가로 동작합니다.</p>
        {mode === 'online' && roomId && (
          <div className="text-emerald-400 text-sm mt-2 space-y-0.5">
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

      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}

      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-4 mb-4">
        <h3 className="text-yellow-400 font-bold mb-2">단어 수준</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PACK_DATA).map(([key, pack]) => (
            <button
              key={key}
              type="button"
              onClick={() => (mode === 'online' && isHost && onlineOk ? syncPackOnline(key) : setSelectedPackKey(key))}
              disabled={mode === 'online' && !isHost}
              className={`rounded-full px-3 py-2 text-sm font-bold ${selectedPackKey === key ? 'bg-yellow-400 text-slate-900' : 'bg-slate-700'} ${mode === 'online' && !isHost ? 'opacity-60' : ''}`}
            >
              {pack.name}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-2xl bg-slate-800 rounded-2xl border border-slate-700 p-4 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-green-400 font-bold">참가자 ({totalCount}명)</h3>
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
              className="rounded-lg bg-green-800 px-3 py-1 text-xs font-bold"
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
              className="rounded-lg bg-slate-600 px-3 py-1 text-xs font-bold"
            >
              − AI
            </button>
          </div>
        </div>
        <ul className="space-y-1 text-sm">
          {members.map((m, i) => {
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
          <p className="text-amber-400 text-xs mt-2">
            {ROOM_MIN}~{roomMax}명으로 맞춰 주세요.
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-3 mb-6">
        <button type="button" onClick={() => setShowRules(true)} className="rounded-full bg-slate-700 px-6 py-3 font-bold">게임 방법</button>
        <button type="button" onClick={() => setShowWordList(true)} className="rounded-full bg-green-800 px-6 py-3 font-bold">족보 단어장</button>
      </div>

      {mode === 'offline' && (
        <button
          type="button"
          onClick={handleStartOffline}
          disabled={!canStart}
          className="rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-10 py-4 text-xl font-black shadow-lg"
        >
          게임 시작
        </button>
      )}

      {mode === 'online' && isHost && roomId && (
        <button
          type="button"
          onClick={handleStartOnline}
          disabled={!canStart || busy || (remoteRoom?.phase === 'playing')}
          className="rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-40 px-10 py-4 text-xl font-black shadow-lg"
        >
          게임 시작 (호스트)
        </button>
      )}

      {mode === 'online' && !isHost && roomId && (
        <p className="text-slate-400 text-sm">호스트가 게임을 시작할 때까지 대기 중…</p>
      )}

      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-800 max-w-lg w-full rounded-2xl border border-slate-600 p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-2xl font-bold text-yellow-400 mb-4">게임 방법</h2>
            <ul className="text-slate-300 space-y-2 text-sm list-disc pl-5">
              <li>모든 플레이어는 카드를 받고, 가나다순으로 내야 합니다.</li>
              <li>AI는 자동으로 타이밍에 맞춰 냅니다.</li>
              <li>온라인에서는 호스트가 타이머·AI를 맞춥니다.</li>
            </ul>
            <button type="button" onClick={() => setShowRules(false)} className="mt-6 w-full rounded-xl bg-blue-600 py-3 font-bold">닫기</button>
          </div>
        </div>
      )}

      <JokboWordListModal
        open={showWordList}
        packTitle={PACK_DATA[selectedPackKey].name}
        currentWordDB={currentWordDB}
        onClose={() => setShowWordList(false)}
      />

      {showNameEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-800 max-w-md w-full rounded-2xl border border-slate-600 p-6">
            <h2 className="text-xl font-bold text-sky-300 mb-3">표시 이름</h2>
            <p className="text-slate-400 text-xs mb-2">게임에 보이는 이름입니다. 온라인 방에 있으면 다른 참가자에게도 반영됩니다.</p>
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
        </div>
      )}
    </div>
  );
}
