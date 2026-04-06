import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReviewMeaningQuiz from './ReviewMeaningQuiz.jsx';
import DraggablePanel from './DraggablePanel.jsx';
import { shuffleArray } from '../utils/helpers.js';
import { playLevelClearCelebration } from '../lib/gameSounds.js';

/**
 * 레벨 클리어 / 게임 오버 / 최종 승리 모달
 */
export default function ResultModal({
  gameState,
  level,
  TOTAL_LEVELS,
  reviewedWords,
  setReviewedWords,
  allCards,
  startLevel,
  setGameState,
  onGoLobby,
  gameOverExplain = null,
}) {
  const [quizCard, setQuizCard] = useState(null);
  const lastFanfareLevelRef = useRef(null);

  /** 이번 레벨에서 복습할 카드: 1레벨 1장 … N레벨 N장(상한: 이번 레벨 카드 수) 무작위 추출 */
  const reviewOrder = useMemo(() => {
    if (!allCards?.length) return [];
    const sorted = [...allCards].sort((a, b) => a.rank - b.rank);
    const n = Math.min(Math.max(1, level), sorted.length);
    const shuffled = shuffleArray([...sorted]);
    return shuffled.slice(0, n);
  }, [allCards, level]);

  const reviewDoneCount = useMemo(
    () => reviewOrder.filter((c) => reviewedWords.includes(c.id)).length,
    [reviewOrder, reviewedWords]
  );
  const reviewComplete = reviewOrder.length === 0 || reviewDoneCount >= reviewOrder.length;

  const nextUnreviewedCard = useMemo(
    () => reviewOrder.find((c) => !reviewedWords.includes(c.id)) ?? null,
    [reviewOrder, reviewedWords]
  );

  useEffect(() => {
    if (gameState !== 'level_clear') return;
    setQuizCard(null);
  }, [gameState, level]);

  /** 레벨 클리어 본화면 진입 시 빵파레·박수 — 레벨당 1회 */
  useEffect(() => {
    if (gameState !== 'level_clear') return;
    if (lastFanfareLevelRef.current === level) return;
    lastFanfareLevelRef.current = level;
    playLevelClearCelebration();
  }, [gameState, level]);

  if (gameState !== 'level_clear' && gameState !== 'game_over' && gameState !== 'victory') return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-slate-900/80 p-4 backdrop-blur-sm">
      {gameState === 'level_clear' && (
        <div className="pointer-events-auto max-w-2xl w-full flex flex-col items-center">
          <DraggablePanel className="w-full max-w-2xl rounded-2xl border border-slate-600 bg-slate-900/95 p-4 shadow-2xl">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-4xl font-black text-green-400 mb-2">레벨 {level} 클리어!</h2>
          {level % 3 === 0 && <p className="text-yellow-400 font-bold mb-4">보너스! &apos;길라잡이&apos;를 1개 얻었습니다. (3레벨마다)</p>}

          <button
            type="button"
            onClick={() => {
              if (reviewOrder.length > 0 && !reviewComplete) {
                if (!window.confirm('복습을 모두 마치지 않았습니다. 로비(홈)로 나가시겠습니까?')) return;
              }
              onGoLobby?.();
            }}
            className="mb-4 w-full max-w-sm rounded-xl border border-slate-500 bg-slate-700/90 py-2.5 text-sm font-bold text-slate-100 hover:bg-slate-600"
          >
            🏠 홈으로 나가기
          </button>

          {/* 모바일: 단어 목록·순서를 숨기고 버튼으로만 퀴즈 진입 (정답 노출 방지) */}
          <div className="md:hidden w-full mb-4 space-y-3 text-center">
            <p className="text-sm text-slate-300">
              복습 진행: {reviewDoneCount} / {reviewOrder.length}
            </p>
            {nextUnreviewedCard ? (
              <button
                type="button"
                onClick={() => setQuizCard(nextUnreviewedCard)}
                className="w-full max-w-sm rounded-xl bg-amber-600 hover:bg-amber-500 py-4 px-4 font-bold text-lg text-white shadow-lg"
              >
                뜻 맞추기 ({reviewOrder.length - reviewDoneCount}개 남음)
              </button>
            ) : (
              <p className="text-emerald-400 font-bold">이번에 정한 복습을 모두 마쳤습니다.</p>
            )}
            <p className="text-xs text-slate-500 break-keep">
              단어 목록은 가려 두었습니다. 버튼을 눌러 퀴즈를 풀어 주세요.
            </p>
          </div>

          <div className="hidden md:block w-full bg-slate-800 rounded-xl p-4 mb-6 max-h-[45vh] overflow-y-auto border border-slate-600">
            <h3 className="text-lg font-bold text-white mb-2 text-center border-b border-slate-700 pb-2">이번에 복습할 단어 (무작위 {reviewOrder.length}개)</h3>
            <p className="text-xs text-slate-400 text-center mb-3 break-keep">
              단어를 누르면 뜻 3지선다가 열립니다. 정답을 고르면 복습 완료입니다. (맞춘 뜻은 목록에 표시하지 않습니다)
            </p>
            <ul className="space-y-2">
              {reviewOrder.map((c, i) => {
                  const isReviewed = reviewedWords.includes(c.id);
                  return (
                    <li
                      key={c.id}
                      onClick={() => {
                        if (isReviewed) return;
                        setQuizCard(c);
                      }}
                      className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                        isReviewed
                          ? 'bg-slate-700/60 border-2 border-slate-500 cursor-default'
                          : 'bg-slate-700/50 hover:bg-slate-700 border-2 border-transparent cursor-pointer'
                      }`}
                    >
                      <span
                        className={`${isReviewed ? 'bg-emerald-700' : 'bg-slate-600'} text-white text-xs font-bold px-2 py-1 rounded min-w-[24px] text-center shrink-0 mt-1`}
                      >
                        {i + 1}
                      </span>

                      <div className="flex-1 break-words leading-relaxed flex flex-wrap items-center gap-2">
                        <span className={`font-bold text-xl ${isReviewed ? 'text-emerald-200' : 'text-white'}`}>
                          {c.word}
                        </span>
                        {isReviewed && (
                          <span className="text-xs font-bold text-emerald-300/90">✓ 복습함</span>
                        )}
                      </div>
                    </li>
                  );
                })}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => (level === TOTAL_LEVELS ? setGameState('victory') : startLevel(level + 1))}
            disabled={!reviewComplete}
            className={`px-8 py-3 rounded-full font-bold text-xl transition-all shadow-lg w-full max-w-sm ${
              reviewComplete
                ? 'bg-green-500 hover:bg-green-400 text-white cursor-pointer'
                : 'bg-slate-600 text-slate-400 cursor-not-allowed'
            }`}
          >
            {level === TOTAL_LEVELS ? '최종 결과 보기' : '다음 레벨로'}
          </button>
          </DraggablePanel>
        </div>
      )}

      {gameState === 'game_over' && (
        <div className="pointer-events-auto flex justify-center w-full">
          <DraggablePanel className="max-w-md rounded-2xl border border-slate-600 bg-slate-900/95 p-8 text-center shadow-2xl">
            <div className="text-6xl mb-6">💀</div>
            <h2 className="text-4xl font-black text-red-500 mb-4">게임 오버</h2>
            {gameOverExplain?.kind === 'wrong_order' && (
              <p className="text-sm text-amber-100 mb-4 break-keep leading-relaxed">
                순서 오류: <strong className="text-white">{gameOverExplain.playedWord}</strong>을(를) 냈을 때, 그보다
                앞서 사전 순으로 내야 할 카드가 있었습니다.
                {Array.isArray(gameOverExplain.missedWords) && gameOverExplain.missedWords.length > 0 ? (
                  <>
                    {' '}
                    먼저 나와야 할 단어:{' '}
                    <strong className="text-amber-200">{gameOverExplain.missedWords.join(' · ')}</strong>
                  </>
                ) : null}
              </p>
            )}
            {gameOverExplain?.kind === 'timeout' && (
              <p className="text-sm text-slate-300 mb-4 break-keep">
                시간 안에 이번에 가장 먼저 제출해야 할 카드가 나오지 않아 생명이 깎였습니다.
              </p>
            )}
            <p className="text-slate-300 mb-8">생명력을 모두 잃었습니다. (도달 레벨: {level})</p>
            <button
              type="button"
              onClick={() => (onGoLobby ? onGoLobby() : setGameState('home'))}
              className="bg-slate-600 hover:bg-slate-500 text-white px-8 py-3 rounded-full font-bold text-xl transition-colors"
            >
              로비로 돌아가기
            </button>
          </DraggablePanel>
        </div>
      )}

      {gameState === 'victory' && (
        <div className="pointer-events-auto flex justify-center w-full">
          <DraggablePanel className="max-w-md rounded-2xl border border-yellow-600/50 bg-slate-900/95 p-8 text-center shadow-2xl">
            <div className="text-6xl mb-6">🏆</div>
            <h2 className="text-5xl font-black text-yellow-400 mb-4">최종 승리!</h2>
            <p className="text-slate-300 mb-8">모든 레벨의 사전 순서를 마스터하셨습니다!</p>
            <button
              type="button"
              onClick={() => (onGoLobby ? onGoLobby() : setGameState('home'))}
              className="bg-yellow-500 hover:bg-yellow-400 text-slate-900 px-8 py-3 rounded-full font-bold text-xl transition-colors shadow-lg shadow-yellow-500/50"
            >
              로비로
            </button>
          </DraggablePanel>
        </div>
      )}

      {quizCard && (
        <ReviewMeaningQuiz
          card={quizCard}
          allCards={allCards}
          onCorrect={() => {
            const id = quizCard.id;
            setReviewedWords((prev) => {
              if (prev.includes(id)) return prev;
              const next = [...prev, id];
              const nextCard = reviewOrder.find((c) => !next.includes(c.id)) ?? null;
              setTimeout(() => setQuizCard(nextCard), 400);
              return next;
            });
          }}
          onClose={() => setQuizCard(null)}
          onGoLobby={() => {
            if (!window.confirm('복습 중입니다. 로비(홈)로 나가시겠습니까?')) return;
            setQuizCard(null);
            onGoLobby?.();
          }}
        />
      )}
    </div>
  );
}
