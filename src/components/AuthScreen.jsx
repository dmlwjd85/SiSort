import React, { useState } from 'react';
import { isFirebaseConfigured } from '../lib/firebase.js';
import { registerWithEmail, loginWithEmail } from '../lib/authService.js';
import { createUserProfile, recordUserAccess } from '../lib/userProfileService.js';
import { buildAccountEmail, pinToFirebasePassword } from '../lib/accountIdentity.js';
import { safeSetItem } from '../utils/safeStorage.js';

const GUEST_KEY = 'sisort_guest';

/** 생년월일 8자리(YYYYMMDD) 유효 여부 */
function isValidBirthDate8(s) {
  if (!/^\d{8}$/.test(s)) return false;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (y < 1900 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * 메인 로그인: 회원가입(이름 실명·생년월일·비밀번호 4자리) / 동일 조합 로그인 / 게스트
 */
export default function AuthScreen({ onGuest, onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | register | guest
  /** 가입·로그인 식별용 실명 (로비의 «표시 이름»과 별개로 쓸 수 있음) */
  const [legalName, setLegalName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [birthDate8, setBirthDate8] = useState('');
  const [guestName, setGuestName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const firebaseOk = isFirebaseConfigured();

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr('');
    const bd = birthDate8.trim().replace(/\D/g, '');
    if (bd.length !== 8 || !isValidBirthDate8(bd)) {
      setErr('생년월일을 숫자 8자리(예: 20150315)로 올바르게 입력해 주세요.');
      return;
    }
    const real = legalName.trim();
    if (real.length < 2 || real.length > 24) {
      setErr('이름(실명)은 2~24자로 입력해 주세요.');
      return;
    }
    const pin = password.replace(/\D/g, '');
    if (pin.length !== 4) {
      setErr('비밀번호는 숫자 4자리로 입력해 주세요.');
      return;
    }
    if (pin !== password2.replace(/\D/g, '')) {
      setErr('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    let internalEmail;
    try {
      internalEmail = buildAccountEmail(real, bd);
    } catch {
      setErr('이름(실명)과 생년월일을 확인해 주세요.');
      return;
    }
    const firebasePw = pinToFirebasePassword(pin);
    setBusy(true);
    try {
      const user = await registerWithEmail(internalEmail, firebasePw, real);
      await createUserProfile(user.uid, {
        email: user.email || internalEmail,
        birthDate: bd,
        displayName: real,
      });
      safeSetItem('sisort_name', real);
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErr('이미 같은 이름(실명)·생년월일로 가입된 계정입니다. 로그인해 주세요.');
      } else if (code === 'auth/invalid-email') setErr('계정 식별에 실패했습니다. 이름을 확인해 주세요.');
      else if (code === 'auth/weak-password') setErr('비밀번호 처리에 실패했습니다.');
      else if (code === 'auth/operation-not-allowed') {
        setErr(
          'Firebase에서 이메일/비밀번호 로그인이 꺼져 있습니다. 콘솔 → Authentication → Sign-in method → 이메일/비밀번호를 켜 주세요. API 키는 다른 저장소의 .env와 동일한지 확인하세요.'
        );
      } else setErr(er?.message || '회원가입에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr('');
    const real = legalName.trim();
    const bd = birthDate8.trim().replace(/\D/g, '');
    const pin = password.replace(/\D/g, '');
    if (real.length < 2 || bd.length !== 8 || !isValidBirthDate8(bd)) {
      setErr('이름(실명, 2자 이상)과 생년월일 8자리를 확인해 주세요.');
      return;
    }
    if (pin.length !== 4) {
      setErr('비밀번호는 숫자 4자리입니다.');
      return;
    }
    let internalEmail;
    try {
      internalEmail = buildAccountEmail(real, bd);
    } catch {
      setErr('이름(실명)과 생년월일을 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const user = await loginWithEmail(internalEmail, pinToFirebasePassword(pin));
      await recordUserAccess(user.uid);
      const name = user.displayName || user.email?.split('@')[0] || '사용자';
      safeSetItem('sisort_name', name);
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErr('이름(실명)·생년월일·비밀번호(4자리)를 확인해 주세요.');
      } else if (code === 'auth/invalid-email') setErr('로그인 정보를 확인해 주세요.');
      else if (code === 'auth/operation-not-allowed') {
        setErr(
          'Firebase에서 이메일/비밀번호 로그인이 꺼져 있습니다. 콘솔 → Authentication → Sign-in method → 이메일/비밀번호를 켜 주세요.'
        );
      } else setErr(er?.message || '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleGuest = (e) => {
    e.preventDefault();
    const t = guestName.trim();
    if (t.length < 1 || t.length > 24) {
      setErr('표시 이름을 1~24자로 입력해 주세요.');
      return;
    }
    safeSetItem('sisort_name', t);
    safeSetItem(GUEST_KEY, '1');
    onGuest(t);
  };

  if (!firebaseOk) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
        <h1 className="text-3xl font-black text-amber-300 mb-2">침묵의 가나다</h1>
        <p className="text-slate-400 text-sm mb-6 text-center break-keep">
          Firebase 설정(VITE_FIREBASE_*)이 없습니다. 게스트로만 진행합니다.
        </p>
        <form onSubmit={handleGuest} className="w-full max-w-sm space-y-3">
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="표시 이름"
            maxLength={24}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-center"
          />
          <button type="submit" className="w-full rounded-xl bg-slate-600 py-3 font-bold">
            게스트로 시작
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white pb-12">
      <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-1">
        침묵의 가나다
      </h1>
      <p className="text-slate-400 text-sm mb-6 text-center break-keep max-w-md">
        회원은 <strong className="text-slate-200">이름(실명)</strong>·생년월일·숫자 비밀번호 4자리만 받습니다(이메일 입력 없음). 같은 실명·생일 조합은 한 계정만 만들 수 있습니다. 팩은 진행에 따라 잠금 해제됩니다. 게스트는 유치원·6학년 사회 팩만 이용할 수 있습니다.
      </p>

      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => { setMode('login'); setErr(''); }}
          className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'login' ? 'bg-blue-600' : 'bg-slate-700'}`}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setErr(''); }}
          className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'register' ? 'bg-emerald-600' : 'bg-slate-700'}`}
        >
          회원가입
        </button>
        <button
          type="button"
          onClick={() => { setMode('guest'); setErr(''); }}
          className={`rounded-full px-4 py-2 text-sm font-bold ${mode === 'guest' ? 'bg-amber-600' : 'bg-slate-700'}`}
        >
          게스트
        </button>
      </div>

      {err && <p className="text-red-400 text-sm mb-3 max-w-sm text-center">{err}</p>}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-3">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="이름 (실명, 가입 시와 동일)"
            maxLength={24}
            autoComplete="name"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            required
          />
          <input
            inputMode="numeric"
            autoComplete="bday"
            value={birthDate8}
            onChange={(e) => setBirthDate8(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="생년월일 8자리 (YYYYMMDD)"
            maxLength={8}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 tracking-widest"
            required
          />
          <input
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="비밀번호 4자리 (숫자)"
            maxLength={4}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 tracking-widest"
            required
          />
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-blue-600 py-3 font-bold disabled:opacity-50">
            로그인
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="w-full max-w-sm space-y-3">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="이름 (실명, 2~24자)"
            maxLength={24}
            autoComplete="name"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            required
          />
          <input
            inputMode="numeric"
            autoComplete="bday"
            value={birthDate8}
            onChange={(e) => setBirthDate8(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="생년월일 8자리 (YYYYMMDD)"
            maxLength={8}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 tracking-widest"
            required
          />
          <p className="text-[11px] text-slate-500 text-center -mt-1">예: 20150315</p>
          <input
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="비밀번호 4자리 (숫자)"
            maxLength={4}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 tracking-widest"
            required
          />
          <input
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="비밀번호 확인 (4자리)"
            maxLength={4}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 tracking-widest"
            required
          />
          <button type="submit" disabled={busy} className="w-full rounded-xl bg-emerald-600 py-3 font-bold disabled:opacity-50">
            가입 후 시작
          </button>
        </form>
      )}

      {mode === 'guest' && (
        <form onSubmit={handleGuest} className="w-full max-w-sm space-y-3">
          <p className="text-amber-200/90 text-xs text-center break-keep">
            게스트: 유치원 팩·6학년 사회 팩만 열립니다. 기록은 기기에만 남습니다.
          </p>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="표시 이름"
            maxLength={24}
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-center"
          />
          <button type="submit" className="w-full rounded-xl bg-amber-600 py-3 font-bold text-slate-900">
            게스트로 시작
          </button>
        </form>
      )}
    </div>
  );
}
