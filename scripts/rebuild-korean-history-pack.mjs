/**
 * 한국사 초기 팩: 선행 번호 제거 후 가나다순 정렬 (일회성·재실행 가능)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../src/data/wordsKoreanHistoryEarly.js');

const s = fs.readFileSync(target, 'utf8');
const m = s.match(/parsePack\(\[([\s\S]*?)\]\)/);
if (!m) throw new Error('parsePack 배열을 찾을 수 없습니다.');

const body = m[1];
const lines = body
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^'[^']*',?$/.test(l) || /^'[^']*'$/.test(l));

const collator = new Intl.Collator('ko', { sensitivity: 'variant', numeric: true });

const entries = [];
for (const line of lines) {
  const inner = line.replace(/^'/, '').replace(/',?$/, '');
  const idx = inner.indexOf(':');
  if (idx < 0) continue;
  const wordRaw = inner.slice(0, idx).trim();
  const desc = inner.slice(idx + 1).trim();
  const word = wordRaw.replace(/^\d{1,3}\s+/, '').trim();
  if (!word) continue;
  entries.push({ word, desc });
}

entries.sort((a, b) => collator.compare(a.word, b.word));

if (entries.length !== 100) {
  console.warn(`경고: 항목 수 ${entries.length} (100개 기대)`);
}

const quoted = entries.map((e) => `    '${e.word}:${e.desc}'`);

const out = `import { parsePack } from '../utils/helpers.js';

/**
 * 한국사 초기(선사~발해) 시기 중요 낱말 100개 — 카드 앞 순번 없음, 가나다순 나열
 */
export const koreanHistoryEarlyPack = {
  name: '📜 한국사 초기 (선사~발해) — 100개',
  words: parsePack([
${quoted.join(',\n')}
  ]),
};
`;

fs.writeFileSync(target, out, 'utf8');
console.log('작성 완료:', target, '항목:', entries.length);
