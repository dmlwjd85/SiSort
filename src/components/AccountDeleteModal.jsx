import React, { useState, useEffect } from 'react';
import DraggablePanel from './DraggablePanel.jsx';
import { deleteOwnAccountWithPin, getFirebaseAuth } from '../lib/authService.js';

/**
 * 회원 본인 계정·프로필 삭제 (앱스토어 계정 삭제 요건)
 */
export default function AccountDeleteModal({ open, onClose, onDeleted }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setErr('');
    setBusy(false);
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    const p = pin.replace(/\D/g, '');
    if (p.length !== 4) {
      setErr('비밀번호(숫자 4자리)를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const uidBefore = getFirebaseAuth()?.currentUser?.uid;
      await deleteOwnAccountWithPin(p);
      onDeleted?.(uidBefore);
      onClose?.();
    } catch (er) {
      const code = er?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setErr('비밀번호가 올바르지 않습니다.');
      } else if (er?.message) {
        setErr(er.message);
      } else {
        setErr('삭제에 실패했습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="pointer-events-auto w-full max-w-md">
        <DraggablePanel className="rounded-2xl border border-rose-600/50 bg-slate-900/98 p-6 shadow-2xl">
          <h2 className="text-xl font-black text-rose-300 mb-2">계정 삭제</h2>
          <p className="text-[13px] text-slate-300 leading-relaxed break-keep mb-4">
            삭제 시 서버에 저장된 회원 프로필(진행도·표시 이름 등)이 제거되고 로그인이 불가능해집니다.
            <strong className="text-rose-200"> 명예의 전당에 남은 표시는 별도 정책에 따라 유지될 수 있습니다.</strong>
            되돌릴 수 없습니다.
          </p>
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
            <div>
              <label htmlFor="sisort-del-pin" className="block text-xs font-bold text-slate-400 mb-1">
                비밀번호 확인 (숫자 4자리)
              </label>
              <input
                id="sisort-del-pin"
                inputMode="numeric"
                type="password"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="0000"
                maxLength={4}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-center text-lg tracking-widest text-white"
              />
            </div>
            {err ? <p className="text-sm text-rose-300 break-keep">{err}</p> : null}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => onClose?.()}
                disabled={busy}
                className="flex-1 rounded-xl bg-slate-700 py-3 font-bold text-white disabled:opacity-40"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-xl bg-rose-700 py-3 font-bold text-white hover:bg-rose-600 disabled:opacity-40"
              >
                {busy ? '처리 중…' : '삭제하기'}
              </button>
            </div>
          </form>
        </DraggablePanel>
      </div>
    </div>
  );
}
