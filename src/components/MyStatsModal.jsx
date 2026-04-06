import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirestoreDb } from '../lib/firebase.js';
import DraggablePanel from './DraggablePanel.jsx';
import { PACK_DATA } from '../data/words.js';
import { PACK_UNLOCK_ORDER } from '../lib/packOrder.js';

/**
 * 본인 플레이 통계(인정된 클리어만 누적) — 관리자 패널과 동일 Firestore users 문서
 */
export default function MyStatsModal({ open, onClose, uid }) {
  const [data, setData] = useState(null);
  const db = getFirestoreDb();

  useEffect(() => {
    if (!open || !uid || !db) {
      setData(null);
      return undefined;
    }
    const ref = doc(db, 'users', uid);
    return onSnapshot(
      ref,
      (snap) => setData(snap.exists() ? snap.data() : null),
      () => setData(null)
    );
  }, [open, uid, db]);

  if (!open) return null;

  const ps = data?.playStats;
  const packProgress = data?.packProgress && typeof data.packProgress === 'object' ? data.packProgress : {};
  const packKeys = PACK_UNLOCK_ORDER.filter((k) => PACK_DATA[k]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[190] flex items-center justify-center bg-black/50 p-4">
      <div className="pointer-events-auto max-h-[90vh] w-full max-w-lg overflow-hidden">
        <DraggablePanel className="rounded-2xl border border-sky-600/50 bg-slate-800 shadow-2xl">
          <div className="max-h-[85vh] overflow-y-auto p-5">
            <h2 className="mb-3 text-center text-xl font-black text-sky-300">내 플레이 기록</h2>
            <p className="mb-4 text-center text-[11px] text-slate-500 break-keep">
              팩 잠금·명예의 전당에 반영되는 <strong className="text-amber-200">오프라인에서 가상 플레이어 1명</strong>과 한
              판일 때만 레벨이 누적됩니다.
            </p>
            {!data && <p className="text-center text-slate-400">불러오는 중…</p>}
            {data && (
              <div className="space-y-4 text-sm text-slate-200">
                <div className="rounded-lg bg-slate-900/80 p-3 border border-slate-600">
                  <p className="text-amber-200 font-bold">인정된 레벨 클리어 횟수(누적)</p>
                  <p className="text-2xl font-black tabular-nums text-white">
                    {ps?.eligibleLevelClears != null ? ps.eligibleLevelClears : 0}회
                  </p>
                  {ps?.lastPackKey && (
                    <p className="mt-2 text-xs text-slate-400">
                      최근: {PACK_DATA[ps.lastPackKey]?.name ?? ps.lastPackKey} · Lv.{ps.lastLevel ?? '—'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="mb-2 font-bold text-slate-300">팩별 최고 레벨</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                    {packKeys.map((k) => (
                      <li key={k} className="flex justify-between border-b border-slate-700/80 py-1">
                        <span className="text-slate-400">{PACK_DATA[k]?.name ?? k}</span>
                        <span className="tabular-nums font-bold">{packProgress[k] ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="text-[10px] text-slate-500">
                  접속 {data.accessCount != null ? `${data.accessCount}회` : '—'} · 관리자에게도 동일 정보가 보입니다.
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-slate-600 py-3 font-bold text-white hover:bg-slate-500"
            >
              닫기
            </button>
          </div>
        </DraggablePanel>
      </div>
    </div>
  );
}
