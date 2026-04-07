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
      className={`relative flex flex-col items-center justify-start p-2 sm:p-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto overscroll-contain pb-4 max-lg:pb-6 ${hideAllDuringMobileReview}`}
    >
      <div className="w-full max-w-[min(100%,80rem)] flex flex-wrap justify-center gap-3 sm:gap-8 lg:gap-10 mt-1 sm:mt-2 lg:mt-3">
        {opponentSlots.map((op, i) => {
          const cards = cardsBySlot(op.slotIndex);
          const style = OPPONENT_STYLES[i % OPPONENT_STYLES.length];
          return (
            <div key={op.playerId} className="flex flex-col items-center max-w-[min(100%,13rem)]">
              <div
                className={`${style} px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg mb-1.5 text-[11px] sm:text-sm font-bold border text-center max-w-[11rem] truncate`}
                title={op.name}
              >
                {op.isAI ? '🤖' : '👤'} {op.name}
                {op.isAI && (
                  <span className="block text-[9px] sm:text-[10px] font-semibold text-emerald-200/95 mt-0.5 tabular-nums">
                    {cards.length}장
                  </span>
                )}
              </div>
              <div className="flex gap-0.5 sm:gap-1 flex-wrap justify-center">
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleRevealAICard(c.id)}
                    disabled={!isHintMode || c.revealed}
                    className={`w-9 h-[3.25rem] sm:w-12 sm:h-16 rounded-md sm:rounded shadow-sm flex flex-col items-center justify-center transition-transform ${
                      c.revealed
                        ? 'bg-white border-2 border-yellow-400 scale-110 z-10'
                        : isHintMode
                          ? 'bg-yellow-400/25 border-2 border-amber-400/90 hover:bg-yellow-400/45 cursor-pointer active:scale-95 touch-manipulation'
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

      <div className="w-[min(100%,18rem)] min-h-[13.5rem] sm:min-h-0 sm:h-72 sm:w-56 border-2 sm:border-4 border-dashed border-slate-600/90 rounded-2xl sm:rounded-3xl flex flex-col bg-slate-800/40 shadow-inner mt-4 sm:mt-8 p-1 sm:p-0">
        {lastPlayed ? (
          <div
            className={`flex flex-1 flex-col min-h-0 bg-white rounded-xl sm:rounded-2xl shadow-xl text-center animate-bounce-short border-2 sm:border-4 ${
              parseSlot(lastPlayed.owner) === mySlotIndex ? 'border-sky-400' : 'border-violet-400'
            } ${correctFx ? 'animate-correct-play' : ''}`}
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-1.5 min-h-0 p-2 sm:p-4 pt-3 sm:pt-4">
              <span className="text-2xl sm:text-5xl font-black text-slate-800 leading-tight break-words max-w-full px-0.5">
                {lastPlayed.word}
              </span>
              <div className="w-full flex-1 min-h-[2.5rem] max-h-[min(40vh,9rem)] sm:max-h-none overflow-y-auto overscroll-contain px-0.5">
                <span className="text-[11px] sm:text-sm text-slate-600 font-medium break-keep block">
                  {lastPlayed.desc}
                </span>
              </div>
            </div>
            <div className="shrink-0 border-t border-slate-200/90 bg-slate-50/95 px-2 py-1.5 sm:py-2 rounded-b-lg sm:rounded-b-xl">
              <span className="text-[9px] sm:text-xs font-bold text-slate-500">{getOwnerLabel(lastPlayed.owner)}</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-2 py-4">
            <span className="md:hidden text-slate-400 text-center text-[11px] font-bold leading-tight">
              <span className="text-sky-400">↓</span> 가나다 <span className="text-amber-300">앞장</span>
            </span>
            <span className="hidden md:inline text-slate-500 font-medium text-center text-sm leading-snug">
              가장 먼저 올 단어를 눈치껏 내세요
            </span>
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl mt-4 sm:mt-8 bg-slate-800/60 sm:bg-slate-800/80 rounded-xl p-2 sm:p-4 border border-slate-700/80">
        <h3 className="text-xs sm:text-sm font-bold text-slate-400 mb-2 flex items-center justify-between gap-2">
          <span className="truncate">사전 진행</span>
          <span className="shrink-0 bg-slate-700/90 px-2 py-0.5 rounded-full text-[11px] sm:text-xs tabular-nums text-slate-200">
            {sortedPlayedStack.length}/{allCards.length}
          </span>
        </h3>
        <div className="flex flex-wrap gap-1 sm:gap-1.5 content-start max-h-24 sm:max-h-none overflow-y-auto sm:overflow-x-auto sm:overflow-y-visible pb-1 -mx-0.5 px-0.5 scrollbar-thin scrollbar-thumb-slate-600">
          {sortedPlayedStack.map((card) => (
            <span
              key={card.id}
              className="inline-flex items-center rounded-md bg-slate-700/90 px-1.5 py-0.5 text-xs sm:text-sm font-semibold text-white border border-slate-600/80 shrink-0"
            >
              {card.word}
            </span>
          ))}
          {sortedPlayedStack.length === 0 && (
            <div className="text-slate-500 py-1.5 w-full text-center md:italic text-[10px] md:text-sm">
              <span className="md:hidden">↑ 제출 순서</span>
              <span className="hidden md:inline">제출된 단어가 여기 쌓입니다</span>
            </div>
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

      {isPreparing && (
        <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-xl bg-slate-950/85 p-3 backdrop-blur-sm md:backdrop-blur-md">
          <div className="pointer-events-auto w-full max-w-xl px-1">
            <DraggablePanel className="rounded-xl border border-teal-600/30 bg-slate-900/98 p-3 shadow-xl md:p-4">
              <h2 className="mb-1 text-center text-base font-bold text-teal-200 md:hidden">살펴보기</h2>
              <p className="mb-2 px-0.5 text-center text-[12px] font-medium leading-snug text-slate-200 break-keep md:hidden">
                아래 <strong className="text-teal-300">내 카드</strong>에서 순서를 맞춘 뒤 시작하세요.
              </p>
              <p className="mb-3 px-0.5 text-center text-[10px] leading-snug text-slate-500 break-keep md:hidden">
                팀 생명은 공유됩니다. 가상 플레이어 실수에도 생명이 줄 수 있어요.
              </p>
              <div className="mb-3 flex flex-wrap justify-center gap-1.5 text-[10px] md:hidden">
                <span className="rounded-full border border-teal-500/30 bg-teal-500/15 px-2 py-1 text-teal-100">정렬</span>
                <span className="rounded-full border border-teal-500/30 bg-teal-500/15 px-2 py-1 text-teal-100">드래그</span>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-1 text-slate-400">탭✕제출</span>
              </div>
              <h2 className="mb-2 hidden text-center text-xl font-semibold text-teal-200 break-keep md:block md:text-2xl">
                손패에서 사전 순서를 맞춰 주세요
              </h2>
              <p className="mb-2 hidden text-center text-sm font-medium leading-relaxed text-slate-300 break-keep md:block">
                <strong className="text-teal-300">가나다 한번에 정렬</strong> 또는 <strong className="text-teal-300">드래그</strong>로 순서를 바꿀 수 있습니다.
              </p>
              <p className="mb-3 hidden text-center text-[11px] leading-relaxed text-slate-500 break-keep md:block">
                생명력은 팀이 함께 씁니다.
              </p>
              {typeof onSkipPrep === 'function' && (
                <button
                  type="button"
                  onClick={onSkipPrep}
                  className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white shadow-md transition-colors duration-150 hover:bg-teal-500 active:bg-teal-700 md:py-3 md:text-base"
                >
                  <span className="md:hidden">시작하기</span>
                  <span className="hidden md:inline">준비 완료 · 시작하기</span>
                </button>
              )}
            </DraggablePanel>
          </div>

          {/* 데스크톱만: 살펴보기 중 손패 미리보기 — 모바일은 실제 손패와 겹쳐 제거 */}
          <div className="pointer-events-none mb-3 mt-2 hidden max-h-[38vh] w-full flex-wrap justify-center gap-3 overflow-y-auto px-2 md:flex">
            {userHand.map((card) => (
              <div
                key={card.id}
                className="flex h-40 w-28 shrink-0 flex-col items-center justify-center rounded-2xl border-4 border-blue-400 bg-white p-2 text-slate-800 shadow-2xl sm:h-44 sm:w-32 md:h-44 md:w-32"
              >
                <span className="mb-1 text-2xl font-black sm:text-3xl">{card.word}</span>
                <span className="line-clamp-4 text-center text-[10px] leading-tight text-slate-600 sm:text-xs">{card.desc}</span>
              </div>
            ))}
          </div>

          {prepTimeLeft >= 1 && (
            <p className="mb-1 text-xs font-semibold text-teal-100/90 tabular-nums md:text-sm">
              <span className="md:hidden">{prepTimeLeft}초 후 시작</span>
              <span className="hidden md:inline">자동 시작까지 · {prepTimeLeft}초</span>
            </p>
          )}
          <div className="font-black tabular-nums text-teal-200 text-5xl sm:text-6xl md:text-8xl md:animate-pulse">
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
