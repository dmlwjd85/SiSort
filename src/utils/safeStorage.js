/**
 * 사파리 사생활 보호·저장소 비허용 등으로 localStorage가 막힐 때 앱 전체가 멈추지 않도록 래핑
 */

export function safeGetItem(key, fallback = '') {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function safeSetItem(key, value) {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
