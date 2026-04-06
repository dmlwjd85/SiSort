import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AuthScreen from './components/AuthScreen.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import PlayScreen from './components/PlayScreen.jsx';
import AdminPanel from './components/AdminPanel.jsx';
import MyStatsModal from './components/MyStatsModal.jsx';
import { useSilentDictionaryGame } from './hooks/useSilentDictionaryGame.js';
import { getOrCreatePlayerId, setPlayerIdFromAuth, clearPlayerId } from './lib/playerId.js';
import { safeGetItem, safeSetItem } from './utils/safeStorage.js';
import { isFirebaseConfigured } from './lib/firebase.js';
import { subscribeAuth, logoutFirebase } from './lib/authService.js';
import {
  fetchUserPackState,
  updatePackProgressRemote,
  tryUpdateHallOfFame,
  recordEligibleLevelClear,
  fetchAdminCapabilities,
  isUserBanned,
  peekAdminCapabilitiesSync,
  readCachedUserPackState,
  writeCachedUserPackState,
  clearCachedUserPackState,
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
  const [packUnlockBonus, setPackUnlockBonus] = useState([]);
  const [phase, setPhase] = useState('lobby');
  const [adminOpen, setAdminOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  /** 차단 계정 로그인 시도 후 로그인 화면에 표시 */
  const [authNotice, setAuthNotice] = useState('');
  /** 마스터·관리자 권한(기록 조회, 회원별 잠금 해제 등) */
  const [adminCaps, setAdminCaps] = useState(() => ({
    isAdmin: false,
    master: false,
    viewRecords: false,
    unlockMembers: false,
    showAdminPanel: false,
  }));

  const onLevelCleared = useCallback(
    async (packKey, clearedLevel, meta) => {
      if (guestMode || !authUser?.uid) return;
      if (!meta?.eligible) return;
      try {
        await updatePackProgressRemote(authUser.uid, packKey, clearedLevel);
        const st = await fetchUserPackState(authUser.uid);
        setPackProgress(st.packProgress || {});
        setPackUnlockBonus(st.packUnlockBonus || []);
        writeCachedUserPackState(authUser.uid, st);
        await recordEligibleLevelClear(authUser.uid, packKey, clearedLevel);
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
      if (u) {
        const banned = await isUserBanned(u.uid);
        if (banned) {
          setAuthNotice('관리자에 의해 이 계정의 접속이 제한되었습니다.');
          try {
            await logoutFirebase();
          } catch (e) {
            console.error(e);
          }
          setAuthUser(null);
          return;
        }
      }
      /* Firestore 팩·권한 조회는 아래 useEffect로 분리 — 마스터 등 로그인 직후 화면이 멈춘 것처럼 보이지 않게 */
      setAuthUser(u ?? null);
    });
  }, []);

  const defaultAdminCaps = useMemo(
    () => ({
      isAdmin: false,
      master: false,
      viewRecords: false,
      unlockMembers: false,
      showAdminPanel: false,
    }),
    []
  );

  useEffect(() => {
    if (!authUser?.uid) {
      setPackProgress({});
      setPackUnlockBonus([]);
      setAdminCaps(defaultAdminCaps);
      return undefined;
    }
    setAuthNotice('');
    setGuestMode(false);
    safeSetItem(GUEST_KEY, '0');

    /* 세션 캐시 + 이메일 기반 관리자 — Firestore 응답 전에도 팩 잠금·관리 버튼이 비활성처럼 보이지 않게 */
    const cached = readCachedUserPackState(authUser.uid);
    if (cached) {
      setPackProgress(cached.packProgress);
      setPackUnlockBonus(cached.packUnlockBonus);
    }
    const peek = peekAdminCapabilitiesSync(authUser);
    if (peek) setAdminCaps(peek);

    let cancelled = false;
    (async () => {
      try {
        const [st, caps] = await Promise.all([
          fetchUserPackState(authUser.uid),
          fetchAdminCapabilities(authUser),
        ]);
        if (cancelled) return;
        setPackProgress(st.packProgress || {});
        setPackUnlockBonus(st.packUnlockBonus || []);
        writeCachedUserPackState(authUser.uid, st);
        const name = authUser.displayName || authUser.email?.split('@')[0] || '';
        if (name) {
          safeSetItem('sisort_name', name);
          setPlayerName(name);
        }
        setAdminCaps(caps);
      } catch (e) {
        console.error('[authUser profile]', e);
        if (!cancelled) {
          const p = peekAdminCapabilitiesSync(authUser);
          setAdminCaps(p ?? defaultAdminCaps);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUser, defaultAdminCaps]);

  const onLeaveLobby = async () => {
    if (game.netRoom?.db && game.netRoom?.roomId) {
      await game.performLeaveOnline();
    } else {
      game.resetToLobby();
    }
    setPhase('lobby');
  };

  const handleLogout = async () => {
    const uidBefore = authUser?.uid;
    try {
      await logoutFirebase();
    } catch (e) {
      console.error(e);
    }
    if (uidBefore) clearCachedUserPackState(uidBefore);
    clearPlayerId();
    setGuestMode(false);
    safeSetItem(GUEST_KEY, '0');
    setPlayerName('');
    safeSetItem('sisort_name', '');
    setPackProgress({});
    setPackUnlockBonus([]);
    setAdminCaps({
      isAdmin: false,
      master: false,
      viewRecords: false,
      unlockMembers: false,
      showAdminPanel: false,
    });
    setAuthUser(null);
    game.resetToLobby();
    setPhase('lobby');
  };

  /** 게스트 둘러보기 종료 → 로그인 화면 */
  const handleGuestExitToLogin = () => {
    safeSetItem(GUEST_KEY, '0');
    setGuestMode(false);
    setPlayerName('');
    safeSetItem('sisort_name', '');
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
        notice={authNotice}
        onDismissNotice={() => setAuthNotice('')}
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
        notice={authNotice}
        onDismissNotice={() => setAuthNotice('')}
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
          authUid={authUser?.uid ?? null}
          packProgress={packProgress}
          packUnlockBonus={packUnlockBonus}
          onLogout={
            firebaseOk
              ? isGuestUi
                ? handleGuestExitToLogin
                : handleLogout
              : undefined
          }
          logoutLabel={isGuestUi ? '로그인 화면으로' : '로그아웃'}
          onOpenAdmin={adminCaps.showAdminPanel ? () => setAdminOpen(true) : undefined}
          onOpenMyStats={authUser && !isGuestUi ? () => setStatsOpen(true) : undefined}
        />
        <AdminPanel
          open={adminOpen}
          onClose={() => setAdminOpen(false)}
          capabilities={adminCaps}
          currentUid={authUser?.uid}
        />
        <MyStatsModal open={statsOpen} onClose={() => setStatsOpen(false)} uid={authUser?.uid} />
      </>
    );
  }

  return (
    <>
      <PlayScreen {...game} onLeaveLobby={onLeaveLobby} />
      <AdminPanel
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        capabilities={adminCaps}
        currentUid={authUser?.uid}
      />
    </>
  );
}
