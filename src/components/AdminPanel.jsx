import React, { useState, useEffect } from 'react';
import { PACK_DATA } from '../data/words.js';
import { PACK_UNLOCK_ORDER } from '../lib/packOrder.js';
import { fetchAllUserProfiles } from '../lib/userProfileService.js';

/**
 * 교사용: 가입 회원 목록·팩별 최대 레벨·접속 기록 요약
 */
export default function AdminPanel({ open, onClose }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setErr('');
    fetchAllUserProfiles()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message || '목록을 불러오지 못했습니다. Firestore 규칙·관리자 권한을 확인하세요.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const packKeys = PACK_UNLOCK_ORDER.filter((k) => PACK_DATA[k]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-600">
          <h2 className="text-xl font-bold text-amber-300">관리자 · 회원 목록</h2>
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-600 px-3 py-1 text-sm font-bold">
            닫기
          </button>
        </div>
        <div className="p-4 overflow-auto flex-1">
          {loading && <p className="text-slate-400">불러오는 중…</p>}
          {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
          {!loading && !err && rows.length === 0 && (
            <p className="text-slate-400">등록된 사용자가 없습니다.</p>
          )}
          {!loading && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200 border-collapse">
                <thead>
                  <tr className="border-b border-slate-600 text-slate-400">
                    <th className="py-2 pr-3">실명</th>
                    <th className="py-2 pr-3">생년월일</th>
                    <th className="py-2 pr-3">이메일</th>
                    <th className="py-2 pr-3 whitespace-nowrap">인정 클리어</th>
                    <th className="py-2 pr-3">접속</th>
                    {packKeys.map((k) => (
                      <th key={k} className="py-2 pr-2 whitespace-nowrap text-[10px] font-normal max-w-[4rem]">
                        {PACK_DATA[k]?.name?.slice(0, 8) ?? k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-700/80">
                      <td className="py-2 pr-3">{r.displayName || '—'}</td>
                      <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap">{r.birthDate || '—'}</td>
                      <td className="py-2 pr-3 text-xs break-all">{r.email || '—'}</td>
                      <td className="py-2 pr-3 text-xs tabular-nums text-center">
                        {r.playStats?.eligibleLevelClears != null ? r.playStats.eligibleLevelClears : '—'}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap">
                        {r.accessCount != null ? `${r.accessCount}회` : '—'}
                        <br />
                        <span className="text-slate-500">
                          {Array.isArray(r.accessHistory) && r.accessHistory.length > 0
                            ? r.accessHistory[r.accessHistory.length - 1]?.at?.slice?.(0, 16)
                            : ''}
                        </span>
                      </td>
                      {packKeys.map((k) => {
                        const pp = r.packProgress && typeof r.packProgress === 'object' ? r.packProgress : {};
                        const v = pp[k];
                        return (
                          <td key={k} className="py-2 pr-2 text-center text-xs tabular-nums">
                            {v != null && v !== '' ? v : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-slate-500 mt-4 break-keep">
            숫자는 해당 팩에서 달성한 최대 클리어 레벨입니다. Firestore에 <code className="text-slate-400">users</code>{' '}
            컬렉션과 관리자용 보안 규칙이 필요합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
