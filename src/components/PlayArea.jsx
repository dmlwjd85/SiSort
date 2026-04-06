import React from 'react';
import DraggablePanel from './DraggablePanel.jsx';

const OPPONENT_STYLES = [
  'bg-purple-900/50 border-purple-500 text-purple-200',
  'bg-indigo-900/50 border-indigo-500 text-indigo-200',
  'bg-rose-900/50 border-rose-500 text-rose-200',
  'bg-cyan-900/50 border-cyan-500 text-cyan-200',
  'bg-amber-900/50 border-amber-500 text-amber-200',
  'bg-emerald-900/50 border-emerald-500 text-emerald-200',
  'bg-fuchsia-900/50 border-fuchsia-500 text-fuchsia-200',
  'bg-sky-900/50 border-sky-500 text-sky-200',
];

/**
 * 상대 슬롯 영역, 중앙 카드, 완성 사전, 메시지·준비 오버레이
 */
export default function PlayArea({
  gameState,
  opponentSlots,
  cardsBySlot,
  getOwnerLabel,
  isHintMode,
  handleRevealAICard,
  lastPlayed,
  sortedPlayedStack,
  allCards,
  message,
  isPreparing,
  prepTimeLeft,
  userHand,
  mySlotIndex,
  hintActorName = '',
}) {
  /* 레벨 클리어 복습 단계: 모바일에서 제출 스택·손패·중앙 카드 등이 보이면 퀴즈 정답이 노출됨 → 영역 전체 숨김 */
  const hideAllDuringMobileReview =
    gameState === 'level_clear' ? 'max-md:hidden' : '';
  return (
    <div
      className={`flex-1 relative flex flex-col items-center justify-start p-4 overflow-y-auto ${hideAllDuringMobileReview}`}
    >
      <div className="w-full max-w-5xl flex flex-wrap justify-center gap-6 sm:gap-10 mt-4">
        {opponentSlots.map((op, i) => {
          const cards = cardsBySlot(op.slotIndex);
          const style = OPPONENT_STYLES[i % OPPONENT_STYLES.length];
          return (
            <div key={op.playerId} className="flex flex-col items-center max-w-[min(100%,14rem)]">
              <div className={`${style} px-3 py-1 rounded-lg mb-2 text-xs sm:text-sm font-bold border text-center`}>
                {op.isAI ? '🤖' : '👤'} {op.name}
                {op.isAI && (
                  <span className="block text-[10px] font-semibold text-emerald-200/95 mt-1 tabular-nums">
                    남은 {cards.length}장
                  </span>
                )}
              </div>
              <div className="flex gap-1 flex-wrap justify-center">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleRevealAICard(c.id)}
                    disabled={!isHintMode || c.revealed}
                    className={`w-10 h-14 sm:w-12 sm:h-16 rounded shadow-sm flex flex-col items-center justify-center transition-transform ${
                      c.revealed
                        ? 'bg-white border-2 border-yellow-400 scale-110 z-10'
                        : isHintMode
                          ? 'bg-yellow-400/20 border border-yellow-400 animate-pulse hover:bg-yellow-400/40 cursor-pointer'
                          : 'bg-slate-700 border border-slate-600'
                    }`}
                  >
                    {c.revealed ? (
                      <span className="text-slate-900 font-bold text-xs sm:text-sm">{c.word}</span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">?</span>
                    )}
                  </button>
                ))}
                {cards.length === 0 && <span className="text-xs text-slate-500 mt-2">완료</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-56 h-72 border-4 border-dashed border-slate-600 rounded-3xl flex flex-col items-center justify-center relative bg-slate-800/50 shadow-inner mt-8">
        {lastPlayed ? (
          <div
            className={`absolute inset-0 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center p-4 text-center animate-bounce-short border-4 ${
              parseSlot(lastPlayed.owner) === mySlotIndex ? 'border-blue-400' : 'border-purple-400'
            }`}
          >
            <span className="text-4xl sm:text-5xl font-black text-slate-800 mb-2">{lastPlayed.word}</span>
            <span className="text-xs sm:text-sm text-slate-600 font-medium break-keep">{lastPlayed.desc}</span>
            <span className="absolute bottom-3 text-[10px] sm:text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
              {getOwnerLabel(lastPlayed.owner)}
            </span>
          </div>
        ) : (
          <span className="text-slate-500 font-medium text-center px-4 text-sm">
            가장 먼저 올 단어를<br />눈치껏 내세요!
          </span>
        )}
      </div>

      <div className="w-full max-w-4xl mt-8 bg-slate-800/80 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-3 flex items-center gap-2">
          <span>📜 완성되어 가는 사전</span>
          <span className="bg-slate-700 px-2 py-0.5 rounded-full text-xs">
            {sortedPlayedStack.length} / {allCards.length}
          </span>
        </h3>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-600">
          {sortedPlayedStack.map((card) => (
            <div
              key={card.id}
              className="min-w-[100px] bg-slate-700 rounded-lg p-2 flex flex-col justify-between shrink-0 border border-slate-600"
            >
              <div className="text-lg font-bold text-white text-center border-b border-slate-600 pb-1 mb-1">{card.word}</div>
              <div className="text-[10px] text-slate-300 text-center leading-tight line-clamp-2">{card.desc}</div>
              <div className="text-[9px] text-slate-500 text-center mt-1">순서: {card.rank + 1}</div>
            </div>
          ))}
          {sortedPlayedStack.length === 0 && (
            <div className="text-slate-500 text-sm italic py-2">아직 제출된 단어가 없습니다.</div>
          )}
        </div>
      </div>

      {message && (
        <div
          className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center p-4"
          aria-live="polite"
        >
          <div className="pointer-events-auto">
            <DraggablePanel className="max-w-lg rounded-2xl border-2 border-yellow-500 bg-slate-900/95 shadow-2xl">
              <div className="px-6 py-4 text-center text-lg font-bold text-white whitespace-pre-line">
                {message}
              </div>
            </DraggablePanel>
          </div>
        </div>
      )}

      {isHintMode && hintActorName && (
        <div className="pointer-events-none fixed inset-0 z-[56] flex items-start justify-center pt-20 p-2">
          <div className="pointer-events-auto">
            <DraggablePanel className="rounded-xl border border-amber-400 bg-amber-950/95 px-4 py-3 shadow-xl">
              <p className="text-center text-sm font-bold text-amber-100">
                🔍 <strong>{hintActorName}</strong>님이 길라잡이를 사용 중입니다.
              </p>
            </DraggablePanel>
          </div>
        </div>
      )}

      {isPreparing && (
        <div className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900/75 backdrop-blur-md rounded-xl">
          <div className="pointer-events-auto max-w-xl px-2">
            <DraggablePanel className="rounded-xl border border-yellow-600/40 bg-slate-900/95 p-4 shadow-xl">
              <h2 className="text-xl md:text-2xl font-bold text-yellow-400 mb-2 text-center break-keep">
                내 카드를 확인하고 순서를 예상하세요!
              </h2>
              <p className="text-center text-[11px] text-slate-500 mb-4">
                창을 드래그해 둘러볼 수 있습니다. 카드는 아래 손패에서 정렬하세요.
              </p>
            </DraggablePanel>
          </div>

          <div className="pointer-events-none flex justify-center gap-4 flex-wrap mb-6 mt-4 w-full px-4">
            {userHand.map((card) => (
              <div
                key={card.id}
                className="w-28 h-40 sm:w-32 sm:h-44 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center p-3 text-slate-800 border-4 border-blue-400"
              >
                <span className="text-2xl sm:text-3xl font-black mb-2">{card.word}</span>
                <span className="text-xs text-slate-600 text-center leading-tight break-keep">{card.desc}</span>
              </div>
            ))}
          </div>

          <div className="pointer-events-none text-7xl sm:text-8xl font-black text-white drop-shadow-2xl">{prepTimeLeft}</div>
        </div>
      )}
    </div>
  );
}

function parseSlot(owner) {
  return parseInt(String(owner).replace(/^s/, ''), 10);
}
