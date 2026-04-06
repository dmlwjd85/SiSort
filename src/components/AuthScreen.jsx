import React, { useState } from 'react';
import { isFirebaseConfigured } from '../lib/firebase.js';
import { registerWithEmail, loginWithEmail } from '../lib/authService.js';
import { createUserProfile, recordUserAccess } from '../lib/userProfileService.js';
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

function emailLocalPart(emailStr) {
  const s = String(emailStr || '').trim();
  const i = s.indexOf('@');
  return i > 0 ? s.slice(0, i).slice(0, 40) : '사용자';
}

/**
 * 메인 로그인: 회원가입(생년월일 8자리·이메일·비밀번호) / 로그인 / 게스트(유치원+6학년사회 팩)
 */
export default function AuthScreen({ onGuest, onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | register | guest
  const [email, setEmail] = useState('');
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
    if (password.length < 6) {
      setErr('비밀번호는 6자 이상이어야 합니다.');
      return;
    }
    if (password !== password2) {
      setErr('비밀번호 확인이 일치하지 않습니다.');
      return;
    }
    const localName = emailLocalPart(email);
    setBusy(true);
    try {
      const user = await registerWithEmail(email, password, localName);
      await createUserProfile(user.uid, {
        email: user.email || email,
        birthDate: bd,
        displayName: localName,
      });
      safeSetItem('sisort_name', localName);
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/email-already-in-use') setErr('이미 사용 중인 이메일입니다. 로그인해 주세요.');
      else if (code === 'auth/invalid-email') setErr('이메일 형식을 확인해 주세요.');
      else if (code === 'auth/weak-password') setErr('비밀번호가 너무 짧습니다.');
      else setErr(er?.message || '회원가입에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const user = await loginWithEmail(email, password);
      await recordUserAccess(user.uid);
      const name = user.displayName || user.email?.split('@')[0] || '사용자';
      safeSetItem('sisort_name', name);
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErr('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (code === 'auth/invalid-email') setErr('이메일 형식을 확인해 주세요.');
      else setErr(er?.message || '로그인에 실패했습니다.');
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
        회원가입 시 생년월일(8자리)과 이메일만 받으며, 게임·명예의 전당에는 이메일 @ 앞 표시가 쓰입니다. 팩은 진행에 따라 잠금 해제됩니다. 게스트는 유치원·6학년 사회 팩만 이용할 수 있습니다.
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
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            required
          />
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
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
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호 (6자 이상)"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
            required
          />
          <input
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            placeholder="비밀번호 확인"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3"
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
