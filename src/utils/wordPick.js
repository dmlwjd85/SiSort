import { shuffleArray } from './helpers.js';

/** 한글 음절 첫 글자의 초성 인덱스 0~18 (표준 19초성) */
export function hangulChoseongIndex(char) {
  if (!char) return -1;
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return Math.floor((code - 0xac00) / 588);
}

/**
 * 레벨에 쓸 단어를 고르기: 같은 풀 안에서 ㄱ~ㅎ 초성이 가능한 한 고르게 분산
 * @param {{ word: string, desc: string }[]} wordEntries
 */
export function pickWordsBalancedByChoseong(wordEntries, count) {
  const pool = wordEntries.filter(
    (w) => w && typeof w.word === 'string' && w.word.length > 0
  );
  if (pool.length === 0) return [];
  if (pool.length <= count) return shuffleArray(pool);

  const buckets = Array.from({ length: 19 }, () => []);
  const extra = []; /* 첫 글자가 한글 음절이 아닌 항목 */
  for (const w of pool) {
    const idx = hangulChoseongIndex(w.word[0]);
    if (idx >= 0) buckets[idx].push(w);
    else extra.push(w);
  }
  for (let i = 0; i < 19; i++) shuffleArray(buckets[i]);
  shuffleArray(extra);

  const picked = [];
  while (picked.length < count) {
    let progressed = false;
    for (let i = 0; i < 19 && picked.length < count; i++) {
      if (buckets[i].length > 0) {
        picked.push(buckets[i].pop());
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  while (picked.length < count && extra.length > 0) {
    picked.push(extra.pop());
  }

  if (picked.length < count) {
    const used = new Set(picked.map((p) => p.word));
    const rest = pool.filter((w) => !used.has(w.word));
    shuffleArray(rest);
    for (const w of rest) {
      if (picked.length >= count) break;
      picked.push(w);
    }
  }

  return picked.slice(0, count);
}
