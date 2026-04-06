import React, { useState, useEffect } from 'react';
import NameGate from './components/NameGate.jsx';
import LobbyScreen from './components/LobbyScreen.jsx';
import PlayScreen from './components/PlayScreen.jsx';
import { useSilentDictionaryGame } from './hooks/useSilentDictionaryGame.js';
import { getOrCreatePlayerId } from './lib/playerId.js';
import { safeGetItem } from './utils/safeStorage.js';

/**
 * 최상위: 이름 → 로비 → 플레이
 */
export default function App() {
  const [playerName, setPlayerName] = useState(() => safeGetItem('sisort_name', ''));
  const [phase, setPhase] = useState('lobby');
  const game = useSilentDictionaryGame({
    onReturnedToLobby: () => setPhase('lobby'),
  });
  const playerId = getOrCreatePlayerId();

  // setPlayerContext는 ref만 갱신 — game 객체를 의존에 넣으면 매 렌더마다 실행됨
  useEffect(() => {
    game.setPlayerContext(playerId, playerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- playerId만 필요
  }, [playerId]);

  const onLeaveLobby = async () => {
    if (game.netRoom?.db && game.netRoom?.roomId) {
      await game.performLeaveOnline();
    } else {
      game.resetToLobby();
    }
    setPhase('lobby');
  };

  if (!playerName) {
    return <NameGate onSave={setPlayerName} />;
  }

  if (phase === 'lobby') {
    return (
      <LobbyScreen
        game={game}
        playerName={playerName}
        playerId={playerId}
        setPlayerName={setPlayerName}
        onStartPlay={() => setPhase('play')}
      />
    );
  }

  return <PlayScreen {...game} onLeaveLobby={onLeaveLobby} />;
}
