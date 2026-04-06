import React, { useEffect, useState } from 'react';
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
  onSkipPrep,
  userHand,
  mySlotIndex,
  hintActorName = '',
}) {
  /** 순서에 맞게 제출될 때마다 중앙 카드에 짧은 초록 이펙트 */
  const [correctFx, setCorrectFx] = useState(false);
  useEffect(() => {
    if (!lastPlayed) return undefined;
    setCorrectFx(true);
    const t = setTimeout(() => setCorrectFx(false), 700);
    return () => clearTimeout(t);
  }, [lastPlayed, lastPlayed?.id]);

  /* 레벨 클리어 복습 단계: 모바일에서 제출 스택·손패·중앙 카드 등이 보이면 퀴즈 정답이 노출됨 → 영역 전체 숨김 */
  const hideAllDuringMobileReview =
    gameState === 'level_clear' ? 'max-md:hidden' : '';
  return (
    <div
      className={`flex-1 min-h-0 relative flex flex-col items-center justify-start p-3 sm:p-4 overflow-y-auto overscroll-contain ${hideAllDuringMobileReview}`}
    >
      <div className="w-full max-w-[min(100%,80rem)] flex flex-wrap justify-center gap-4 sm:gap-8 lg:gap-10 mt-2 lg:mt-3">
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
            } ${correctFx ? 'animate-correct-play' : ''}`}
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
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900/80 backdrop-blur-md rounded-xl p-3">
          <div className="max-w-xl w-full px-1 pointer-events-auto">
            <DraggablePanel className="rounded-xl border border-yellow-600/40 bg-slate-900/95 p-4 shadow-xl">
              <h2 className="text-lg md:text-2xl font-bold text-yellow-400 mb-2 text-center break-keep">
                내 카드를 확인하고 순서를 예상하세요!
              </h2>
              <p className="text-center text-sm text-amber-100/95 mb-2 break-keep leading-relaxed font-medium">
                아래 손패에서 카드를 <strong className="text-amber-300">꾹 눌러</strong> 사전 순으로 정렬하거나,{' '}
                <strong className="text-amber-300">드래그</strong>해 순서를 바꿀 수 있습니다.
              </p>
              <p className="text-center text-[11px] text-slate-500 mb-3 break-keep">
                Long-press to sort · drag to reorder
              </p>
              {typeof onSkipPrep === 'function' && (
                <button
                  type="button"
                  onClick={onSkipPrep}
                  className="w-full rounded-xl bg-amber-600 hover:bg-amber-500 py-3 font-bold text-base text-white shadow-lg"
                >
                  준비 완료 · 바로 시작
                </button>
              )}
            </DraggablePanel>
          </div>

          <div className="pointer-events-none flex justify-center gap-3 flex-wrap mb-4 mt-4 w-full px-2 max-h-[38vh] overflow-y-auto">
            {userHand.map((card) => (
              <div
                key={card.id}
                className="w-24 h-36 sm:w-28 sm:h-40 md:w-32 md:h-44 bg-white rounded-2xl shadow-2xl flex flex-col items-center justify-center p-2 sm:p-3 text-slate-800 border-4 border-blue-400 shrink-0"
              >
                <span className="text-xl sm:text-2xl md:text-3xl font-black mb-1">{card.word}</span>
                <span className="text-[10px] sm:text-xs text-slate-600 text-center leading-tight break-keep line-clamp-4">{card.desc}</span>
              </div>
            ))}
          </div>

          {prepTimeLeft >= 1 && (
            <p className="text-amber-200/95 text-sm font-bold mb-1 drop-shadow-lg">
              자동 시작까지 · {prepTimeLeft}초
            </p>
          )}
          <div className="font-black text-6xl sm:text-7xl md:text-8xl text-amber-300 drop-shadow-2xl tabular-nums animate-pulse">
            {prepTimeLeft >= 1 ? prepTimeLeft : 0}
          </div>
        </div>
      )}
    </div>
  );
}

function parseSlot(owner) {
  return parseInt(String(owner).replace(/^s/, ''), 10);
}
