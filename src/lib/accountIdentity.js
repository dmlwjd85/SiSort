/**
 * 이메일을 입력받지 않고 Firebase Auth(이메일/비밀번호)를 쓰기 위한 내부 식별자
 * 이름(실명)만으로 고정 이메일 — 비밀번호는 4자리 PIN을 Firebase 최소 6자에 맞게 확장
 */

const DOMAIN = 'sisort.local';

/**
 * 가입·로그인에서 동일한 내부 이메일을 만들기 위해 이름 정규화
 * (한글 NFD/NFC·연속 공백 차이로 해시가 달라지던 문제 방지)
 */
export function normalizeAccountName(s) {
  return String(s || '')
    .trim()
    .normalize('NFC')
    .replace(/\s+/g, ' ');
}

/** 짧은 해시로 로컬파트 길이 제한( Firebase 등 )에 안전하게 맞춤 */
function hashIdentity(name, salt) {
  const s = `${name}\0${salt}`;
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(33, h) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * 이름(실명)만으로 계정용 이메일 (로그인·가입 공통)
 */
export function buildAccountEmailFromName(legalName) {
  const name = normalizeAccountName(legalName);
  if (name.length < 2 || name.length > 24) {
    throw new Error('INVALID_IDENTITY');
  }
  const h = hashIdentity(name, 'sisort_name_v2');
  return `u_n_${h}@${DOMAIN}`;
}

/**
 * @deprecated 구 가입(이름+생년) 계정 호환용 — 신규는 buildAccountEmailFromName 만 사용
 */
export function buildAccountEmail(legalName, birthYyyymmdd) {
  const name = String(legalName || '').trim();
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

/**
 * 마스터 계정: Firebase 콘솔에서 생성할 내부 이메일
 * — «첫 로그인 번호» 숫자(6자리 또는 7자리)가 로컬파트에 그대로 들어감
 */
export function buildMasterAccountEmail(firstLoginDigits) {
  const n = String(firstLoginDigits || '').replace(/\D/g, '');
  if (n.length !== 6 && n.length !== 7) {
    throw new Error('INVALID_MASTER_LOGIN');
  }
  return `master_${n}@${DOMAIN}`;
}

/** 마스터 전용 이메일이면 기존 관리 권한(마스터)과 동일하게 취급 */
export function isMasterAccountEmail(email) {
  return /^master_\d{6,7}@sisort\.local$/i.test(String(email || '').trim());
}

/**
 * 마스터: «첫 로그인 번호»(6·7자리)를 그대로 Firebase 비밀번호로 사용(콘솔에도 동일 숫자로 등록)
 */
export function masterPinToFirebasePassword(pinDigits) {
  const p = String(pinDigits || '').replace(/\D/g, '');
  if (p.length !== 6 && p.length !== 7) throw new Error('INVALID_MASTER_PIN');
  return p;
}
