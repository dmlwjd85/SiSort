import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AuthScreen from './components/AuthScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import PlayScreen from './components/PlayScreen.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import { useSilentDictionaryGame } from './hooks/useSilentDictionaryGame.js';
import { getOrCreatePlayerId, setPlayerIdFromAuth, clearPlayerId } from './lib/playerId.js';
import { safeGetItem, safeSetItem } from './utils/safeStorage.js';
import { isFirebaseConfigured } from './lib/firebase.js';
import { subscribeAuth, logoutFirebase } from './lib/authService.js';
import {
  fetchUserPackProgress,
  updatePackProgressRemote,
  tryUpdateHallOfFame,
  checkIsAdminUser,
} from './lib/userProfileService.js';

const GUEST_KEY = 'sisort_guest';

/**
 * 최상위: Firebase 인증(또는 게스트) → 로비 → 플레이
 */
export default function App() {
  const [authUser, setAuthUser] = useState(undefined);
  const [guestMode, setGuestMode] = useState(() => safeGetItem(GUEST_KEY, '') === '1');
  const [playerName, setPlayerName] = useState(() => safeGetItem('sisort_name', ''));
  const [packProgress, setPackProgress] = useState({});
  const [phase, setPhase] = useState('lobby');
  const [adminOpen, setAdminOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const onLevelCleared = useCallback(
    async (packKey, clearedLevel) => {
      if (guestMode || !authUser?.uid) return;
      try {
        await updatePackProgressRemote(authUser.uid, packKey, clearedLevel);
        const pp = await fetchUserPackProgress(authUser.uid);
        setPackProgress(pp || {});
        const name =
          safeGetItem('sisort_name', '') ||
          authUser.displayName ||
          authUser.email?.split('@')[0] ||
          '익명';
        await tryUpdateHallOfFame(authUser.uid, packKey, clearedLevel, name);
      } catch (e) {
        console.error('[onLevelCleared]', e);
      }
    },
    [guestMode, authUser]
  );

  const game = useSilentDictionaryGame({
    onReturnedToLobby: () => setPhase('lobby'),
    onLevelCleared,
  });

  const playerId = useMemo(() => {
    if (authUser?.uid) return authUser.uid;
    return getOrCreatePlayerId();
  }, [authUser]);

  useEffect(() => {
    if (authUser?.uid) setPlayerIdFromAuth(authUser.uid);
  }, [authUser]);

  useEffect(() => {
    if (authUser && !playerName) {
      const n = authUser.displayName || authUser.email?.split('@')[0] || '사용자';
      setPlayerName(n);
      safeSetItem('sisort_name', n);
    }
  }, [authUser, playerName]);

  useEffect(() => {
    game.setPlayerContext(playerId, playerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setAuthUser(null);
      return undefined;
    }
    return subscribeAuth(async (u) => {
      setAuthUser(u ?? null);
      if (u) {
        setGuestMode(false);
        safeSetItem(GUEST_KEY, '0');
        setPlayerIdFromAuth(u.uid);
        const pp = await fetchUserPackProgress(u.uid);
        setPackProgress(pp || {});
        const name = u.displayName || u.email?.split('@')[0] || '';
        if (name) {
          safeSetItem('sisort_name', name);
          setPlayerName(name);
        }
        setIsAdmin(await checkIsAdminUser(u));
      } else {
        setPackProgress({});
        setIsAdmin(false);
      }
    });
  }, []);

  const onLeaveLobby = async () => {
    if (game.netRoom?.db && game.netRoom?.roomId) {
      await game.performLeaveOnline();
    } else {
      game.resetToLobby();
    }
    setPhase('lobby');
  };

  const handleLogout = async () => {
    try {
      await logoutFirebase();
    } catch (e) {
      console.error(e);
    }
    clearPlayerId();
    setGuestMode(false);
    safeSetItem(GUEST_KEY, '0');
    setPlayerName('');
    safeSetItem('sisort_name', '');
    setPackProgress({});
    setAuthUser(null);
    game.resetToLobby();
    setPhase('lobby');
  };

  if (authUser === undefined && isFirebaseConfigured()) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-sans">
        연결 중…
      </div>
    );
  }

  const firebaseOk = isFirebaseConfigured();
  const showApp = authUser || guestMode || !firebaseOk;

  if (!showApp) {
    return (
      <AuthScreen
        onGuest={(name) => {
          setPlayerName(name);
          setGuestMode(true);
        }}
        onLoggedIn={() => {}}
      />
    );
  }

  if (!playerName && !firebaseOk) {
    return (
      <AuthScreen
        onGuest={(name) => {
          setPlayerName(name);
          setGuestMode(true);
        }}
        onLoggedIn={() => {}}
      />
    );
  }

  const isGuestUi = !firebaseOk || guestMode || !authUser;

  if (phase === 'lobby') {
    return (
      <>
        <LobbyScreen
          game={game}
          playerName={playerName}
          playerId={playerId}
          setPlayerName={setPlayerName}
          onStartPlay={() => setPhase('play')}
          isGuest={isGuestUi}
          packProgress={packProgress}
          onLogout={firebaseOk && authUser ? handleLogout : undefined}
          onOpenAdmin={isAdmin ? () => setAdminOpen(true) : undefined}
        />
        <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
      </>
    );
  }

  return (
    <>
      <PlayScreen {...game} onLeaveLobby={onLeaveLobby} />
      <AdminPanel open={adminOpen} onClose={() => setAdminOpen(false)} />
    </>
  );
}
