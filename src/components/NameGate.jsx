import React, { useState } from 'react';
import { safeGetItem, safeSetItem } from '../utils/safeStorage.js';

/**
 * 최초 접속 시 표시 이름 입력
 */
export default function NameGate({ onSave }) {
  const [name, setName] = useState(() => safeGetItem('sisort_name', ''));

  const submit = (e) => {
    e.preventDefault();
    const t = name.trim();
    if (t.length < 1 || t.length > 12) return;
    safeSetItem('sisort_name', t);
    onSave(t);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
      <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-2">
        침묵의 가나다
      </h1>
      <p className="text-slate-400 text-sm mb-8 text-center break-keep">플레이에 사용할 이름을 입력하세요 (최대 12자)</p>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          maxLength={12}
          className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-lg text-center outline-none focus:border-amber-400"
          autoFocus
        />
        <button
          type="submit"
          className="w-full rounded-xl bg-blue-600 py-3 font-bold text-white hover:bg-blue-500"
        >
          확인
        </button>
      </form>
    </div>
  );
}
