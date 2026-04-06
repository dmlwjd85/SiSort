import React, { useState, useEffect, useMemo, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import JokboWordListModal from './JokboWordListModal.jsx';
import { getFirestoreDb, isFirebaseConfigured, ensureFirebaseAuth } from '../lib/firebase.js';
import {
  createRoomDoc,
  joinRoomDoc,
  updateRoomMembers,
  ROOM_MIN,
  ROOM_MAX,
} from '../lib/roomService.js';
import { normalizeRoomCode, isValidRoomCode, randomRoomCode } from '../lib/roomCode.js';

/**
 * 로비: 4자 방 코드, 멀티플레이(Firebase), 오프라인, AI 인원 조절
 */
export default function LobbyScreen({
  game,
  playerName,
  playerId,
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

  useEffect(() => {
    guestPlayStartedRef.current = false;
  }, [roomId]);

  /** 로컬 오프라인 멤버 (1인 + AI) */
  const [localMembers, setLocalMembers] = useState(() => [
    { playerId, name: playerName, isAI: false },
    { playerId: `ai-${Date.now()}`, name: 'AI 1', isAI: true },
  ]);

  /** 온라인: 방 생성 후에는 Firestore 멤버, 그 전에는 로컬에서 인원 구성 */
  const members = useMemo(() => {
    if (mode === 'online' && remoteRoom?.members?.length) return remoteRoom.members;
    return localMembers;
  }, [mode, remoteRoom, localMembers]);

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
      setRemoteRoom(data);
      if (data.phase === 'playing' && !isHost && !guestPlayStartedRef.current) {
        guestPlayStartedRef.current = true;
        joinOnlineAsGuest({
          db,
          roomId,
          members: data.members || [],
          mySlot: Math.max(0, data.members?.findIndex((m) => m.playerId === playerId) ?? 0),
          playerId,
          hostPlayerId: data.hostId,
        });
        onStartPlay();
      }
    });
  }, [onlineOk, db, roomId, mode, isHost, playerId, joinOnlineAsGuest, onStartPlay]);

  const totalCount = members.length;
  const canStart =
    totalCount >= ROOM_MIN && totalCount <= ROOM_MAX;

  const addAiOffline = () => {
    if (localMembers.length >= ROOM_MAX) return;
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
    if (members.length >= ROOM_MAX) return;
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
    } catch (e) {
      console.error(e);
      const msg = e?.code === 'auth/operation-not-allowed'
        ? 'Firebase 콘솔에서 익명 로그인을 켜 주세요.'
        : e?.message || '';
      setErr(msg ? `방 만들기에 실패했습니다. (${msg})` : '방 만들기에 실패했습니다.');
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
    setBusy(true);
    setErr('');
    try {
      await ensureFirebaseAuth();
      await joinRoomDoc(db, code, { playerId, name: playerName, isAI: false });
      setRoomId(code);
      setIsHost(false);
      setHostPlayerId(null);
      setMode('online');
    } catch (e) {
      console.error(e);
      if (e.message === 'ROOM_NOT_FOUND') setErr('방을 찾을 수 없습니다.');
      else if (e.message === 'GAME_ALREADY_STARTED') setErr('이미 시작된 방입니다.');
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

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center p-4 text-white font-sans pb-24">
      <h1 className="text-4xl md:text-5xl font-black mt-6 mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        침묵의 가나다
      </h1>
      <p className="text-slate-400 text-sm mb-6 text-center">
        {playerName}님 — 방 {ROOM_MIN}~{ROOM_MAX}명
      </p>

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
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={roomCode}
            onChange={(e) => setRoomCode(normalizeRoomCode(e.target.value))}
            maxLength={4}
            className="flex-1 min-w-[8rem] rounded-lg bg-slate-900 border border-slate-600 px-3 py-2 text-center tracking-widest text-xl font-mono uppercase"
          />
          {mode === 'online' && onlineOk && (
            <>
              <button type="button" onClick={handleCreateRoom} disabled={busy || !canStart} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold disabled:opacity-40">
                방 만들기
              </button>
              <button type="button" onClick={handleJoinRoom} disabled={busy} className="rounded-lg bg-slate-600 px-3 py-2 text-sm font-bold">
                참가
              </button>
            </>
          )}
        </div>
        {mode === 'online' && roomId && (
          <p className="text-emerald-400 text-sm mt-2">연결된 방: <strong>{roomId}</strong> {isHost ? '(호스트)' : '(참가자)'}</p>
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
                totalCount >= ROOM_MAX ||
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
          {members.map((m, i) => (
            <li key={`${m.playerId}-${i}`} className="flex justify-between border-b border-slate-700/80 py-1">
              <span>{m.isAI ? '🤖' : '👤'} {m.name}</span>
              <span className="text-slate-500">{m.playerId === playerId ? '(나)' : ''}</span>
            </li>
          ))}
        </ul>
        {!canStart && <p className="text-amber-400 text-xs mt-2">{ROOM_MIN}~{ROOM_MAX}명으로 맞춰 주세요.</p>}
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
    </div>
  );
}
