/**
 * 이메일을 입력받지 않고 Firebase Auth(이메일/비밀번호)를 쓰기 위한 내부 식별자
 * 표시 이름 + 생년월일로 고정 이메일 문자열을 만들고, 비밀번호는 4자리 PIN을 Firebase 최소 6자에 맞게 확장한다.
 */

const DOMAIN = 'sisort.local';

/** 짧은 해시로 로컬파트 길이 제한( Firebase 등 )에 안전하게 맞춤 */
function hashIdentity(name, birth8) {
  const s = `${name}\0${birth8}`;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 표시 이름·생년월일(8자리)로 계정용 이메일 형식 문자열 생성 (사용자에게는 보이지 않음)
 */
export function buildAccountEmail(displayName, birthYyyymmdd) {
  const name = String(displayName || '').trim();
  const b = String(birthYyyymmdd || '').replace(/\D/g, '');
  if (name.length < 1 || b.length !== 8) {
    throw new Error('INVALID_IDENTITY');
  }
  const h = hashIdentity(name, b);
  return `u_${b}_${h}@${DOMAIN}`;
}

/**
 * Firebase Auth 최소 비밀번호 6자 — 사용자는 4자리만 입력, 내부적으로 6자로 확장
 */
export function pinToFirebasePassword(pin4) {
  const p = String(pin4 || '').replace(/\D/g, '');
  if (p.length !== 4) throw new Error('INVALID_PIN');
  return `${p}##`;
}
