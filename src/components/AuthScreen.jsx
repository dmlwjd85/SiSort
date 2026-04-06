import React, { useState } from 'react';
import { isFirebaseConfigured } from '../lib/firebase.js';
import { registerWithEmail, loginWithEmail } from '../lib/authService.js';
import { createUserProfile, recordUserAccess } from '../lib/userProfileService.js';
import { buildAccountEmail, pinToFirebasePassword } from '../lib/accountIdentity.js';
import { safeSetItem } from '../utils/safeStorage.js';

const GUEST_KEY = 'sisort_guest';

/** 입력 필드 공통 (한지·도장 느낌) */
const inputBase =
  'w-full rounded-2xl border border-amber-500/30 bg-slate-950/50 px-4 py-3.5 text-slate-100 placeholder:text-slate-500 shadow-inner focus:border-amber-400/70 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition';

const tabBtn = (active, color) =>
  `rounded-2xl px-4 py-2.5 text-sm font-bold transition-all ${
    active
      ? `${color} text-slate-950 shadow-lg scale-[1.02]`
      : 'bg-slate-800/80 text-slate-300 border border-slate-600/50 hover:bg-slate-700/80'
  }`;

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

/** 배경: 한글·학습 분위기 (가나다 + 따뜻한 그라데이션) */
function AuthBackdrop() {
  const row = '가나다라마바사아자차카타파하';
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden>
      <div className="absolute inset-0 bg-gradient-to-br from-[#1c1410] via-[#0f172a] to-[#1a1c2e]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(217,119,6,0.18),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_100%_100%,rgba(59,130,246,0.12),transparent)]" />
      <div className="absolute inset-0 opacity-[0.06] text-[min(4.5rem,11vw)] font-black leading-[0.95] text-amber-100 tracking-tight">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="whitespace-nowrap overflow-hidden text-center" style={{ opacity: 0.5 + (i % 3) * 0.15 }}>
            {row.repeat(20)}
          </div>
        ))}
      </div>
      {/* 도장 느낌 원형 장식 */}
      <div className="absolute -right-16 top-24 h-48 w-48 rounded-full border-4 border-red-800/20 bg-red-950/10 blur-[1px]" />
      <div className="absolute -left-8 bottom-32 h-32 w-32 rounded-full border-2 border-amber-600/15" />
    </div>
  );
}

/** 상단 배지 + 타이틀 블록 */
function AuthHeader({ subtitle }) {
  return (
    <div className="mb-6 text-center">
      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <span className="rounded-full border border-amber-500/40 bg-amber-950/40 px-3 py-1 text-xs font-bold text-amber-200/95">
          학습
        </span>
        <span className="rounded-full border border-sky-500/35 bg-sky-950/35 px-3 py-1 text-xs font-bold text-sky-200/95">
          한글
        </span>
        <span className="rounded-full border border-rose-500/35 bg-rose-950/30 px-3 py-1 text-xs font-bold text-rose-200/95">
          재미
        </span>
      </div>
      <div className="mb-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-600/25 bg-gradient-to-r from-amber-900/30 to-orange-900/20 px-4 py-2 text-amber-100/90 shadow-md">
        <span className="text-2xl" aria-hidden>
          📖
        </span>
        <h1 className="text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-100 to-orange-200 md:text-3xl">
          침묵의 가나다
        </h1>
      </div>
      <p className="mx-auto max-w-md text-sm leading-relaxed text-slate-400 break-keep">{subtitle}</p>
    </div>
  );
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

  const shell = (children, subtitle) => (
    <div className="relative min-h-screen overflow-x-hidden text-slate-100">
      <AuthBackdrop />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10 pb-14">
        <div className="animate-fade-in rounded-3xl border border-amber-500/20 bg-slate-900/75 p-6 shadow-2xl shadow-black/40 backdrop-blur-md md:p-8">
          <AuthHeader subtitle={subtitle} />
          {children}
        </div>
        <p className="mt-6 text-center text-[11px] text-slate-500 break-keep">
          말 없이도 단어가 보이는 한글 놀이 · 가나다 순서를 맞추며 배워요
        </p>
      </div>
    </div>
  );

  if (!firebaseOk) {
    return shell(
      <>
        <p className="mb-6 text-center text-sm text-amber-200/85 break-keep">
          Firebase 설정(VITE_FIREBASE_*)이 없습니다. <strong className="text-amber-100">게스트로만</strong> 진행합니다.
        </p>
        <form onSubmit={handleGuest} className="w-full space-y-4">
          {err && (
            <p className="rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-center text-sm text-red-300">{err}</p>
          )}
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="표시 이름을 입력하세요"
            maxLength={24}
            className={`${inputBase} text-center text-lg`}
          />
          <button
            type="submit"
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 py-3.5 text-lg font-black text-slate-950 shadow-lg transition hover:brightness-105 active:scale-[0.99]"
          >
            게스트로 시작하기
          </button>
        </form>
      </>,
      '오프라인 모드에서는 이름만 적고 바로 들어가요. 친구와 함께 가나다를 맞춰 보세요.'
    );
  }

  return shell(
    <>
      <p className="mb-6 text-center text-sm leading-relaxed text-slate-400 break-keep">
        회원은 <strong className="text-amber-200/95">이름(실명)</strong>·생년월일·숫자 비밀번호 4자리만 받습니다(이메일 입력 없음). 같은 실명·생일 조합은 한 계정만 만들 수 있습니다. 팩은 진행에 따라 잠금 해제됩니다. 게스트는 유치원·6학년 사회 팩만 이용할 수 있습니다.
      </p>

      <div className="mb-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => { setMode('login'); setErr(''); }} className={tabBtn(mode === 'login', 'bg-sky-500')}>
          로그인
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setErr(''); }}
          className={tabBtn(mode === 'register', 'bg-emerald-500')}
        >
          회원가입
        </button>
        <button type="button" onClick={() => { setMode('guest'); setErr(''); }} className={tabBtn(mode === 'guest', 'bg-amber-400')}>
          게스트
        </button>
      </div>

      {err && (
        <p className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 px-3 py-2 text-center text-sm text-red-300">{err}</p>
      )}

      {mode === 'login' && (
        <form onSubmit={handleLogin} className="w-full space-y-3">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="이름 (실명, 가입 시와 동일)"
            maxLength={24}
            autoComplete="name"
            className={inputBase}
            required
          />
          <input
            inputMode="numeric"
            autoComplete="bday"
            value={birthDate8}
            onChange={(e) => setBirthDate8(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="생년월일 8자리 (YYYYMMDD)"
            maxLength={8}
            className={`${inputBase} tracking-widest`}
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
            className={`${inputBase} tracking-widest`}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 py-3.5 font-black text-white shadow-lg disabled:opacity-50"
          >
            로그인하고 놀러 가기
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="w-full space-y-3">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="이름 (실명, 2~24자)"
            maxLength={24}
            autoComplete="name"
            className={inputBase}
            required
          />
          <input
            inputMode="numeric"
            autoComplete="bday"
            value={birthDate8}
            onChange={(e) => setBirthDate8(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="생년월일 8자리 (YYYYMMDD)"
            maxLength={8}
            className={`${inputBase} tracking-widest`}
            required
          />
          <p className="text-center text-[11px] text-slate-500 -mt-1">예: 20150315</p>
          <input
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="비밀번호 4자리 (숫자)"
            maxLength={4}
            className={`${inputBase} tracking-widest`}
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
            className={`${inputBase} tracking-widest`}
            required
          />
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 font-black text-white shadow-lg disabled:opacity-50"
          >
            가입하고 시작하기
          </button>
        </form>
      )}

      {mode === 'guest' && (
        <form onSubmit={handleGuest} className="w-full space-y-4">
          <p className="rounded-xl border border-amber-500/25 bg-amber-950/25 px-3 py-2 text-center text-xs text-amber-100/95 break-keep">
            게스트: 유치원 팩·6학년 사회 팩만 열립니다. 기록은 기기에만 남습니다.
          </p>
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="표시 이름"
            maxLength={24}
            className={`${inputBase} text-center`}
          />
          <button
            type="submit"
            className="w-full rounded-2xl bg-gradient-to-r from-amber-400 to-orange-500 py-3.5 font-black text-slate-900 shadow-lg"
          >
            게스트로 시작하기
          </button>
        </form>
      )}
    </>,
    '단어를 보고 순서를 맞추는 침묵 딕셔너리. 천천히 배우고, 친구와 겨뤄 보세요.'
  );
}
