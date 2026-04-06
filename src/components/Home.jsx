import React from 'react';
import JokboWordListModal from './JokboWordListModal.jsx';

/**
 * 홈 화면: 타이틀, 단어 팩 선택, 게임 시작, 게임 방법·족보 모달
 */
export default function Home({
  PACK_DATA,
  selectedPackKey,
  setSelectedPackKey,
  startGame,
  showRules,
  setShowRules,
  showWordList,
  setShowWordList,
  currentWordDB
}) {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white font-sans">
      <h1 className="text-5xl md:text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
        침묵의 가나다
      </h1>
      <p className="text-slate-300 mb-2 text-xl font-bold italic">
        The Silent Dictionary Challenge
      </p>
      <p className="text-slate-400 mb-6 text-center max-w-md mt-4 break-keep">
        팀원(AI)과 눈치껏 협력하여<br />모든 단어를 제한시간 안에 <span className="font-bold text-yellow-400">국어사전 순서</span>로 나열하세요!
      </p>

      <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 w-full max-w-2xl mb-8">
        <h3 className="text-center text-yellow-400 font-bold mb-3">👇 플레이할 단어 수준을 선택하세요 👇</h3>
        <div className="flex flex-wrap justify-center gap-2">
          {Object.entries(PACK_DATA).map(([key, pack]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedPackKey(key)}
              className={`px-4 py-2 rounded-full font-bold transition-all text-sm sm:text-base ${
                selectedPackKey === key
                  ? 'bg-yellow-400 text-slate-900 shadow-lg scale-105 border-2 border-yellow-200'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600 border border-slate-600'
              }`}
            >
              {pack.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <button
          type="button"
          onClick={() => setShowRules(true)}
          className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-lg transition-transform hover:scale-105"
        >
          📖 게임 방법
        </button>
        <button
          type="button"
          onClick={() => setShowWordList(true)}
          className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-full text-xl shadow-lg transition-transform hover:scale-105"
        >
          📚 족보 단어장
        </button>
      </div>

      <button
        type="button"
        onClick={startGame}
        className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 px-12 rounded-full text-2xl shadow-lg shadow-blue-500/50 transition-transform hover:scale-105 animate-pulse"
      >
        {PACK_DATA[selectedPackKey].name} 플레이 시작!
      </button>

      {showRules && (
        <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center z-50 p-4 animate-fade-in-up">
          <div className="bg-slate-800 p-6 rounded-3xl max-w-lg w-full border-2 border-slate-600 shadow-2xl max-h-[80vh] overflow-y-auto scrollbar-hide">
            <h2 className="text-3xl font-bold text-yellow-400 mb-4 text-center">침묵의 가나다 게임 방법</h2>
            <div className="text-slate-300 space-y-4 mb-8 text-base sm:text-lg break-keep bg-slate-900/50 p-4 rounded-xl">
              <p>🤫 <strong>말하지 말고, 마음을 읽으세요!</strong></p>
              <p>1. 모든 플레이어는 카드를 받습니다.</p>
              <p>2. 각자의 카드를 <strong>국어사전 순서(가나다순)</strong>로 오름차순으로 내려놓아야 합니다.</p>
              <p>3. 정해진 순서는 없습니다. 내 카드가 제일 앞선다고 생각될 때 눈치껏 내세요!</p>
              <p>4. <strong>제한 시간</strong> 안에 모든 카드를 털어내면 레벨 클리어!</p>
              <p>5. 누군가 더 앞선 단어를 가지고 있었거나 시간이 초과되면 생명력(♥)이 깎입니다.</p>
              <p>🔍 <strong>길라잡이 힌트:</strong> 상단의 버튼을 눌러 AI의 카드를 살짝 엿볼 수 있습니다. (짝수 레벨 클리어 시 보너스 획득!)</p>
            </div>
            <button
              type="button"
              onClick={() => setShowRules(false)}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-full text-xl transition-colors shadow-lg"
            >
              닫기
            </button>
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
