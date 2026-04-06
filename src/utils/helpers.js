// --- 단어 변환 도구 (코드를 깔끔하게 관리하기 위함) ---
export const parsePack = (arr) => arr.map(str => {
  const idx = str.indexOf(':');
  return { word: str.substring(0, idx), desc: str.substring(idx + 1) };
});

// 배열 섞기 함수
export const shuffleArray = (array) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

// 동적 타이머 (1레벨 17초, 이후 레벨마다 3초씩 증가 — 레벨당 +1초)
export const getLevelTime = (lvl) => 17 + (lvl - 1) * 3;

/** 사전 정렬용 문자열 정규화 (유니코드 형태 통일) */
export function normalizeForDictionarySort(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFC').trim();
}

/**
 * 같은 단어(정규화 기준)는 한 번만 남기고 나머지 제거 — 한 팩 안 중복 카드 방지
 * @param {{ word: string, desc?: string }[]} entries
 */
export function dedupeWordEntriesByWord(entries) {
  const seen = new Map();
  for (const e of entries) {
    if (!e || typeof e.word !== 'string') continue;
    const key = normalizeForDictionarySort(e.word);
    if (key && !seen.has(key)) seen.set(key, e);
  }
  return [...seen.values()];
}

/**
 * 국어사전 가나다순 (Intl.Collator — 브라우저·환경별 localeCompare 차이 완화)
 */
const KO_DICT_COLLATOR = new Intl.Collator('ko', { sensitivity: 'variant', numeric: true });

export function compareKoreanDictionary(a, b) {
  return KO_DICT_COLLATOR.compare(normalizeForDictionarySort(a), normalizeForDictionarySort(b));
}

/**
 * 레벨에 뽑힌 단어 목록에 대해 각 항목의 사전 순 고유 순위(0 … n-1)를 부여
 * 동일 어휘가 두 장이어도 desc·원래 인덱스로 구분해 findIndex 중복 버그를 제거
 * @param {{ word: string, desc?: string }[]} entries
 * @returns {number[]}
 */
export function assignDictionaryRanks(entries) {
  const n = entries.length;
  if (n === 0) return [];
  const indexed = entries.map((item, i) => ({ item, i }));
  indexed.sort((a, b) => {
    const cw = KO_DICT_COLLATOR.compare(
      normalizeForDictionarySort(a.item.word),
      normalizeForDictionarySort(b.item.word)
    );
    if (cw !== 0) return cw;
    const cd = KO_DICT_COLLATOR.compare(
      normalizeForDictionarySort(a.item.desc ?? ''),
      normalizeForDictionarySort(b.item.desc ?? '')
    );
    if (cd !== 0) return cd;
    return a.i - b.i;
  });
  const ranks = new Array(n);
  indexed.forEach((entry, rank) => {
    ranks[entry.i] = rank;
  });
  return ranks;
}
