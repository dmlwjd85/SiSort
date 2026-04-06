import React from 'react';
import { useSilentDictionaryGame } from './hooks/useSilentDictionaryGame.js';
import Home from './components/Home.jsx';
import PlayScreen from './components/PlayScreen.jsx';

/**
 * 침묵의 가나다 — 화면 전환만 담당하는 최상위 컴포넌트
 */
export default function App() {
  const game = useSilentDictionaryGame();

  if (game.gameState === 'home') {
    return (
      <Home
        PACK_DATA={game.PACK_DATA}
        selectedPackKey={game.selectedPackKey}
        setSelectedPackKey={game.setSelectedPackKey}
        startGame={game.startGame}
        showRules={game.showRules}
        setShowRules={game.setShowRules}
        showWordList={game.showWordList}
        setShowWordList={game.setShowWordList}
        currentWordDB={game.currentWordDB}
      />
    );
  }

  return <PlayScreen {...game} />;
}
