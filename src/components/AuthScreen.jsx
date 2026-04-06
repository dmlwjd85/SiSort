import React, { useState } from 'react';
import { isFirebaseConfigured } from '../lib/firebase.js';
import { registerWithEmail, loginWithEmail, updateUserDisplayName } from '../lib/authService.js';
import { createUserProfile, recordUserAccess, fetchUserDocument } from '../lib/userProfileService.js';
import {
  buildAccountEmailFromName,
  buildMasterAccountEmail,
  masterPinToFirebasePassword,
  normalizeAccountName,
  pinToFirebasePassword,
} from '../lib/accountIdentity.js';
import { safeSetItem } from '../utils/safeStorage.js';
import KoreanThemeBackdrop from './KoreanThemeBackdrop.jsx';

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
 * 메인 로그인: 회원가입(이름·비밀번호 4자리) / 동일 조합 로그인 / 게스트
 */
export default function AuthScreen({ onGuest, onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | register | guest | master
  /** 가입·로그인 식별용 실명 */
  const [legalName, setLegalName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  /** 마스터: 첫 로그인 번호 6자리 + 비밀번호 6자리(Firebase에 동일 규칙으로 생성된 계정) */
  const [masterFirstLogin, setMasterFirstLogin] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [guestName, setGuestName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const firebaseOk = isFirebaseConfigured();

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr('');
    const real = normalizeAccountName(legalName);
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
      internalEmail = buildAccountEmailFromName(real);
    } catch {
      setErr('이름 형식을 확인해 주세요. (가입 때와 같은 한글·띄어쓰기)');
      return;
    }
    const firebasePw = pinToFirebasePassword(pin);
    setBusy(true);
    try {
      const user = await registerWithEmail(internalEmail, firebasePw, real);
      await createUserProfile(user.uid, {
        email: user.email || internalEmail,
        birthDate: '',
        displayName: real,
      });
      safeSetItem('sisort_name', real);
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErr('이미 같은 이름으로 가입된 계정입니다. 로그인해 주세요.');
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
    const real = normalizeAccountName(legalName);
    if (real.length < 2) {
      setErr('이름(실명)은 2자 이상 입력해 주세요.');
      return;
    }
    const pin = password.replace(/\D/g, '');
    if (pin.length !== 4) {
      setErr('비밀번호는 숫자 4자리입니다.');
      return;
    }
    let internalEmail;
    try {
      internalEmail = buildAccountEmailFromName(real);
    } catch {
      setErr('이름 형식을 확인해 주세요. (가입 때와 같은 한글·띄어쓰기)');
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
        setErr(
          '이름·비밀번호가 가입 때와 같은지 확인해 주세요. 예전(생년 포함) 방식으로 가입한 계정은 이름·숫자 4자리만으로 다시 회원가입해 주세요. / Check name & PIN match signup. Old accounts need to sign up again (name + 4 digits only).'
        );
      } else if (code === 'auth/invalid-email') {
        setErr('로그인 정보 형식을 확인해 주세요. / Check your login fields.');
      } else if (code === 'auth/operation-not-allowed') {
        setErr(
          'Firebase에서 이메일/비밀번호 로그인이 꺼져 있습니다. 콘솔 → Authentication → Sign-in method → 이메일/비밀번호를 켜 주세요.'
        );
      } else setErr(er?.message || '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const handleMasterLogin = async (e) => {
    e.preventDefault();
    setErr('');
    const first = masterFirstLogin.replace(/\D/g, '');
    const pin6 = masterPassword.replace(/\D/g, '');
    if (first.length !== 6) {
      setErr('마스터 «첫 로그인 번호»는 숫자 6자리입니다.');
      return;
    }
    if (pin6.length !== 6) {
      setErr('마스터 비밀번호는 숫자 6자리입니다.');
      return;
    }
    let internalEmail;
    try {
      internalEmail = buildMasterAccountEmail(first);
    } catch {
      setErr('첫 로그인 번호 형식을 확인해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const user = await loginWithEmail(internalEmail, masterPinToFirebasePassword(pin6));
      await updateUserDisplayName(user, '마스터');
      const existing = await fetchUserDocument(user.uid);
      if (!existing) {
        await createUserProfile(user.uid, {
          email: user.email || internalEmail,
          birthDate: '',
          displayName: '마스터',
        });
      } else {
        await recordUserAccess(user.uid);
      }
      safeSetItem('sisort_name', '마스터');
      safeSetItem(GUEST_KEY, '0');
      onLoggedIn(user);
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErr(
          '마스터 첫 로그인 번호·6자리 비밀번호가 Firebase에 등록된 값과 같은지 확인해 주세요. 기존 관리(admins) 권한과 동일한 마스터 기능이 연결됩니다. / Check master first-login # and 6-digit password match the Firebase account.'
        );
      } else if (code === 'auth/invalid-email') {
        setErr('마스터 로그인 정보 형식을 확인해 주세요.');
      } else if (code === 'auth/operation-not-allowed') {
        setErr(
          'Firebase에서 이메일/비밀번호 로그인이 꺼져 있습니다. 콘솔 → Authentication → Sign-in method → 이메일/비밀번호를 켜 주세요.'
        );
      } else setErr(er?.message || '마스터 로그인에 실패했습니다.');
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
      <KoreanThemeBackdrop />
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
        회원은 <strong className="text-amber-200/95">이름(실명)</strong>과 숫자 비밀번호 4자리만 받습니다(이메일 입력 없음). 같은 이름은 한 계정만 만들 수 있습니다. 팩은 진행에 따라 잠금 해제됩니다. 게스트는 유치원·6학년 사회 팩만 이용할 수 있습니다.
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
        <button
          type="button"
          onClick={() => { setMode('master'); setErr(''); }}
          className={tabBtn(mode === 'master', 'bg-violet-600')}
        >
          마스터
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
          <div className="rounded-xl border border-sky-500/35 bg-sky-950/30 px-3 py-2.5 mb-1">
            <p className="text-[12px] text-sky-100/95 text-center break-keep leading-relaxed">
              <strong className="text-amber-200">위 칸</strong>에 이름(실명), <strong className="text-amber-200">아래 칸</strong>에 숫자 비밀번호 4자리를 넣으면 로그인됩니다.
            </p>
            <p className="text-[11px] text-slate-500 text-center mt-1.5 break-keep">
              Put your name in the first field and your 4-digit PIN in the second — then you&apos;re logged in.
            </p>
          </div>
          <div>
            <label htmlFor="sisort-auth-name" className="block text-xs font-bold text-amber-200/90 mb-1.5">
              이름 (실명)
            </label>
            <input
              id="sisort-auth-name"
              name="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="가입 시와 동일한 이름"
              maxLength={24}
              autoComplete="name"
              className={inputBase}
              required
            />
          </div>
          <div>
            <label htmlFor="sisort-auth-password" className="block text-xs font-bold text-amber-200/90 mb-1.5">
              비밀번호 (숫자 4자리)
            </label>
            <input
              id="sisort-auth-password"
              inputMode="numeric"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              maxLength={4}
              className={`${inputBase} tracking-widest`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 py-3.5 font-black text-white shadow-lg disabled:opacity-50"
          >
            로그인하고 놀러 가기
          </button>
        </form>
      )}

      {mode === 'master' && (
        <form onSubmit={handleMasterLogin} className="w-full space-y-3">
          <div className="rounded-xl border border-violet-500/40 bg-violet-950/35 px-3 py-2.5 mb-1">
            <p className="text-[12px] text-violet-100/95 text-center break-keep leading-relaxed">
              <strong className="text-amber-200">마스터 계정</strong>은 «첫 로그인 번호»(숫자 6자리)로 로그인합니다.{' '}
              <strong className="text-amber-200">비밀번호도 숫자 6자리</strong>로 설정해 주세요. Firebase에{' '}
              <code className="rounded bg-slate-800/80 px-1 text-[11px]">master_6자리@sisort.local</code> 형식으로 만든 계정과
              동일해야 합니다. 이 로그인은 기존 <strong className="text-amber-200">관리자·마스터 권한</strong>(기록 열람·회원 잠금 해제)과
              동일하게 연결됩니다.
            </p>
            <p className="text-[11px] text-slate-500 text-center mt-1.5 break-keep">
              Master: 6-digit first login # + 6-digit PIN. Must match the Auth user email pattern. Same capabilities as admin master.
            </p>
          </div>
          <div>
            <label htmlFor="sisort-master-first" className="block text-xs font-bold text-violet-200/95 mb-1.5">
              첫 로그인 번호 (숫자 6자리)
            </label>
            <input
              id="sisort-master-first"
              inputMode="numeric"
              name="masterFirstLogin"
              value={masterFirstLogin}
              onChange={(e) => setMasterFirstLogin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="예: 첫 로그인에 쓸 6자리"
              maxLength={6}
              autoComplete="username"
              className={`${inputBase} tracking-widest text-center text-lg`}
              required
            />
          </div>
          <div>
            <label htmlFor="sisort-master-password" className="block text-xs font-bold text-violet-200/95 mb-1.5">
              비밀번호 (숫자 6자리)
            </label>
            <input
              id="sisort-master-password"
              inputMode="numeric"
              type="password"
              name="masterPassword"
              autoComplete="current-password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className={`${inputBase} tracking-widest`}
              required
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 font-black text-white shadow-lg disabled:opacity-50"
          >
            마스터로 로그인
          </button>
        </form>
      )}

      {mode === 'register' && (
        <form onSubmit={handleRegister} className="w-full space-y-3">
          <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-3 py-2.5 mb-1">
            <p className="text-[12px] text-emerald-100/95 text-center break-keep leading-relaxed">
              위에서 아래 순서로 맞게 입력하면 가입이 완료됩니다. 비밀번호는 숫자 4자리만 사용합니다.
            </p>
            <p className="text-[11px] text-slate-500 text-center mt-1.5 break-keep">
              Fill each field in order — name, then PIN twice. Only digits for the password.
            </p>
          </div>
          <div>
            <label htmlFor="sisort-reg-name" className="block text-xs font-bold text-amber-200/90 mb-1.5">
              이름 (실명, 2~24자)
            </label>
            <input
              id="sisort-reg-name"
              name="legalName"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="실명 입력"
              maxLength={24}
              autoComplete="name"
              className={inputBase}
              required
            />
          </div>
          <div>
            <label htmlFor="sisort-reg-password" className="block text-xs font-bold text-amber-200/90 mb-1.5">
              비밀번호 (숫자 4자리)
            </label>
            <input
              id="sisort-reg-password"
              inputMode="numeric"
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="0000"
              maxLength={4}
              className={`${inputBase} tracking-widest`}
              required
            />
          </div>
          <div>
            <label htmlFor="sisort-reg-password2" className="block text-xs font-bold text-amber-200/90 mb-1.5">
              비밀번호 확인
            </label>
            <input
              id="sisort-reg-password2"
              inputMode="numeric"
              type="password"
              name="new-password-confirm"
              autoComplete="new-password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="한 번 더 입력"
              maxLength={4}
              className={`${inputBase} tracking-widest`}
              required
            />
          </div>
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
