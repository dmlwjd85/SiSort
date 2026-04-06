/**
 * Web Audio — 정답 순서(도레미…), 오답 삑사리, 레벨 클리어 빵파레·박수 느낌
 * 브라우저 자동재생 정책 대비: 첫 사용자 조작 후 resumeAudioContext 호출됨
 */

let audioCtx = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

export function resumeAudioContext() {
  const c = getCtx();
  if (c?.state === 'suspended') {
    c.resume().catch(() => {});
  }
}

/** C4 기준 장음정(도레미파솔라시도…) 반복 — 순서 인덱스는 모듈 내부 */
let correctNoteIndex = 0;

/** C4에서 장2도까지 도레미파솔라시도 레미… (반복 시 다시 낮은 도부터) */
const MAJOR_SCALE_SEMITONES = [
  0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 30, 32, 33, 35, 36, 38, 40,
];

function freqFromSemitones(st) {
  return 261.63 * 2 ** (st / 12);
}

function beep(freq, durationSec, type = 'triangle', gain = 0.14, when = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + durationSec);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec + 0.02);
}

/**
 * 올바른 카드 제출 1회마다 호출 — 낮은 도부터 도레미… 순으로 한 음씩
 */
export function playCorrectPlacedNote() {
  resumeAudioContext();
  const st = MAJOR_SCALE_SEMITONES[correctNoteIndex % MAJOR_SCALE_SEMITONES.length];
  const f = freqFromSemitones(st);
  beep(f, 0.11, 'triangle', 0.13);
  correctNoteIndex += 1;
}

/** 순서 리셋 — 레벨 시작·오답 후 다음 정답이 다시 낮은 도부터 */
export function resetCorrectNoteSequence() {
  correctNoteIndex = 0;
}

/**
 * 오답 삑사리 + 순서 초기화(다음 정답은 다시 낮은 도)
 */
export function playWrongPlacedBuzz() {
  resumeAudioContext();
  resetCorrectNoteSequence();
  if (!getCtx()) return;
  /* 불협화음 짧은 버즈 */
  beep(185, 0.06, 'sawtooth', 0.08, 0);
  beep(220, 0.07, 'square', 0.06, 0.05);
  beep(140, 0.09, 'sawtooth', 0.07, 0.1);
}

/** 레벨 클리어: 짧은 빵파레 + 박수 느낌(노이즈) */
export function playLevelClearCelebration() {
  resumeAudioContext();
  const c = getCtx();
  if (!c) return;
  const start = c.currentTime;
  /* 아르페지오 C E G C */
  const fan = [
    [261.63, 0],
    [329.63, 0.08],
    [392.0, 0.16],
    [523.25, 0.24],
  ];
  for (const [f, w] of fan) {
    beep(f, 0.14, 'triangle', 0.11, w);
  }
  /* 박수 느낌 노이즈 버스트 */
  const noiseDur = 0.45;
  const bufferSize = Math.floor(c.sampleRate * noiseDur);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * 0.35;
  }
  const noise = c.createBufferSource();
  noise.buffer = buffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  const ng = c.createGain();
  const tNoise = start + 0.38;
  ng.gain.setValueAtTime(0.001, tNoise);
  ng.gain.linearRampToValueAtTime(0.12, tNoise + 0.02);
  ng.gain.exponentialRampToValueAtTime(0.001, tNoise + noiseDur);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(c.destination);
  noise.start(tNoise);
  noise.stop(tNoise + noiseDur + 0.05);
}
