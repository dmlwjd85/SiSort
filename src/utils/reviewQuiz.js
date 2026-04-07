import { shuffleArray } from './helpers.js';

/**
 * 복습 퀴즈: 정답 뜻 1개 + 오답 뜻 2개(다른 카드에서 추출, 부족 시 보충 문구)
 * @param {{ id: string, word: string, desc?: string }} targetCard
 * @param {Array<{ id: string, desc?: string }>} allCards
 * @returns {{ key: string, text: string, isCorrect: boolean }[]}
 */
export function buildMeaningChoices(targetCard, allCards) {
  if (!targetCard || typeof targetCard !== 'object') {
    return [
      { key: 'ok', text: '뜻이 없습니다.', isCorrect: true },
      { key: 'w0', text: '보기를 불러오지 못했습니다.', isCorrect: false },
      { key: 'w1', text: '다시 시도해 주세요.', isCorrect: false },
    ];
  }
  const pool = Array.isArray(allCards) ? allCards : [];
  const correctDesc = (targetCard.desc && String(targetCard.desc).trim()) || '뜻이 없습니다.';
  const wrongPool = pool
    .filter((c) => c && c.id !== targetCard.id)
    .map((c) => (c.desc && String(c.desc).trim()) || '')
    .filter((d) => d && d !== correctDesc);
  const uniqueWrong = [...new Set(wrongPool)];
  shuffleArray(uniqueWrong);
  const wrongPicks = uniqueWrong.slice(0, 2);

  const fillers = [
    '이 성어의 올바른 풀이가 아닙니다.',
    '다른 한자 성어에서 가져온 엉뚱한 설명입니다.',
    '사전적 의미와 맞지 않는 보기입니다.',
  ];
  let fi = 0;
  while (wrongPicks.length < 2) {
    const f = fillers[fi % fillers.length];
    fi += 1;
    if (f !== correctDesc && !wrongPicks.includes(f)) wrongPicks.push(f);
  }

  const choices = [
    { key: 'ok', text: correctDesc, isCorrect: true },
    { key: 'w0', text: wrongPicks[0], isCorrect: false },
    { key: 'w1', text: wrongPicks[1], isCorrect: false },
  ];
  return shuffleArray(choices);
}
