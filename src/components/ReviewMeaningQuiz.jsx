import React, { useMemo, useState, useEffect } from 'react';
import { buildMeaningChoices } from '../utils/reviewQuiz.js';
import DraggablePanel from './DraggablePanel.jsx';

/**
 * 레벨 클리어 후 뜻 복습: 정답 포함 3지선다 (화면 중앙 팝업)
 */
export default function ReviewMeaningQuiz({ card, allCards, onCorrect, onClose, onGoLobby }) {
  const choices = useMemo(() => buildMeaningChoices(card, allCards), [card, allCards]);
  const [picked, setPicked] = useState(null);
  const [phase, setPhase] = useState('pick'); /* pick | correct | wrong */

  useEffect(() => {
    setPicked(null);
    setPhase('pick');
  }, [card?.id]);

  if (!card) return null;

  const handlePick = (ch) => {
    if (phase !== 'pick') return;
    setPicked(ch.key);
    if (ch.isCorrect) {
      setPhase('correct');
      globalThis.setTimeout(() => onCorrect(), 450);
    } else {
      setPhase('wrong');
    }
  };

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-quiz-title"
    >
      <div className="pointer-events-auto w-full max-w-lg flex justify-center">
        <DraggablePanel className="w-full max-w-lg rounded-2xl border border-slate-600 bg-slate-800 shadow-2xl">
          <div className="p-6">
        <h2 id="review-quiz-title" className="text-center text-sm font-bold text-slate-400 mb-2">
          뜻 맞추기
        </h2>
        <p className="text-center text-2xl sm:text-3xl font-black text-white mb-6 break-keep">{card.word}</p>
        <p className="text-xs text-slate-500 text-center mb-4">아래 셋 중 이 성어의 뜻으로 맞는 것을 고르세요.</p>

        <div className="flex flex-col gap-3">
          {choices.map((ch) => {
            const isSel = picked === ch.key;
            const showOk = phase === 'correct' && ch.isCorrect;
            const showBad = phase === 'wrong' && isSel && !ch.isCorrect;
            return (
              <button
                key={ch.key}
                type="button"
                disabled={phase !== 'pick'}
                onClick={() => handlePick(ch)}
                className={`text-left rounded-xl px-4 py-3 text-sm sm:text-base font-medium border-2 transition-all break-keep ${
                  showOk
                    ? 'border-emerald-500 bg-emerald-900/40 text-emerald-100'
                    : showBad
                      ? 'border-red-500 bg-red-900/30 text-red-100'
                      : 'border-slate-600 bg-slate-700/80 text-slate-100 hover:border-amber-500/60 hover:bg-slate-700'
                }`}
              >
                {ch.text}
              </button>
            );
          })}
        </div>

        {phase === 'wrong' && (
          <p className="mt-4 text-center text-amber-300 text-sm font-bold break-keep">
            오답입니다. 복습 완료 처리되지 않습니다. 목록에서 다른 단어를 복습한 뒤 다시 도전하세요.
          </p>
        )}

        <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row sm:justify-center sm:gap-3">
          {phase === 'wrong' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-slate-600 hover:bg-slate-500 px-6 py-2 font-bold text-white"
            >
              닫기
            </button>
          )}
          {typeof onGoLobby === 'function' && (
            <button
              type="button"
              onClick={onGoLobby}
              className="rounded-full border border-amber-600/80 bg-slate-800 px-6 py-2 font-bold text-amber-200 hover:bg-slate-700"
            >
              🏠 홈으로 나가기
            </button>
          )}
        </div>
          </div>
        </DraggablePanel>
      </div>
    </div>
  );
}
