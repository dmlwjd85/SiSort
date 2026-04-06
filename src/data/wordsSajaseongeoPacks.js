import { parsePack } from '../utils/helpers.js';
import { compareKoreanDictionary } from '../utils/helpers.js';
import beginnerRaw from './sajaseongeo/beginner100.txt?raw';
import { SAJASEONGEO_INTERMEDIATE_LINES } from './wordsSajaseongeoIntermediateData.js';
import { SAJASEONGEO_ADVANCED_LINES } from './wordsSajaseongeoAdvancedData.js';

function parsePackSorted(lines) {
  const arr = Array.isArray(lines)
    ? [...lines]
    : lines
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
  const sorted = arr.sort((a, b) => {
    const wa = a.split(':')[0].trim();
    const wb = b.split(':')[0].trim();
    return compareKoreanDictionary(wa, wb);
  });
  return parsePack(sorted);
}

/** 초급·중급·고급 각 100개, 팩 내부는 국어사전 순으로 정렬 */
export const sajaseongeoBeginnerPack = {
  name: '📿 사자성어 · 초급 (100)',
  words: parsePackSorted(beginnerRaw),
};

export const sajaseongeoIntermediatePack = {
  name: '📿 사자성어 · 중급 (100)',
  words: parsePackSorted(SAJASEONGEO_INTERMEDIATE_LINES),
};

export const sajaseongeoAdvancedPack = {
  name: '📿 사자성어 · 고급 (100)',
  words: parsePackSorted(SAJASEONGEO_ADVANCED_LINES),
};
