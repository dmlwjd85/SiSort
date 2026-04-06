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

// 동적 타이머 (1레벨 14초, 이후 2초씩 증가)
export const getLevelTime = (lvl) => 14 + (lvl - 1) * 2;
