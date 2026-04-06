import React, { useState, useEffect, useCallback } from 'react';
import { PACK_DATA } from '../data/words.js';
import { PACK_UNLOCK_ORDER } from '../lib/packOrder.js';
import { fetchAllUserProfiles, setUserPackUnlockBonus, banAndRemoveUserData } from '../lib/userProfileService.js';

const defaultCaps = {
  isAdmin: false,
  master: false,
  viewRecords: false,
  unlockMembers: false,
  showAdminPanel: false,
};

/** 모바일에서 한 줄로 보이도록 이름 앞 4글자만(전체는 title) */
function shortName4(s) {
  const t = typeof s === 'string' ? s.trim() : '';
  if (!t) return '—';
  if (t.length <= 4) return t;
  return `${t.slice(0, 4)}…`;
}

/**
 * 교사용: 가입 회원 목록·팩별 최대 레벨·접속 요약(기록 조회 권한)
 * 마스터·unlockMembers 권한: 회원별 팩 추가 잠금 해제(packUnlockBonus) 편집
 */
export default function AdminPanel({ open, onClose, capabilities = defaultCaps, currentUid }) {
  const { master, viewRecords, unlockMembers } = capabilities;
  const showStats = viewRecords || master;
  const showUnlock = unlockMembers || master;

  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  /** 편집 중인 회원 uid — 모달 */
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockDraft, setUnlockDraft] = useState([]);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockErr, setUnlockErr] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadRows = useCallback(() => {
    setLoading(true);
    setErr('');
    return fetchAllUserProfiles()
      .then((list) => setRows(list))
      .catch((e) => {
        setErr(e?.message || '목록을 불러오지 못했습니다. Firestore 규칙·관리자 권한을 확인하세요.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadRows().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [open, loadRows]);

  const packKeys = PACK_UNLOCK_ORDER.filter((k) => PACK_DATA[k]);

  const openUnlockModal = (row) => {
    const raw = row.packUnlockBonus;
    const cur = Array.isArray(raw) ? raw.filter((k) => PACK_DATA[k]) : [];
    setUnlockDraft([...cur]);
    setUnlockErr('');
    setUnlockTarget(row);
  };

  const toggleUnlockPack = (key) => {
    setUnlockDraft((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const handleDeleteMember = async (row) => {
    if (!row?.id || row.id === currentUid) return;
    const legal = row.displayName || '회원';
    const shown = row.shownName || row.displayName || '—';
    const ok = window.confirm(
      `다음 회원을 삭제(접속 차단)할까요?\n실명: ${legal}\n표시 이름: ${shown}\n\nFirestore 프로필이 삭제되며 재로그인이 막힙니다. Firebase Authentication 사용자는 콘솔에서 별도 삭제할 수 있습니다.`
    );
    if (!ok) return;
    setDeleteBusy(true);
    setErr('');
    try {
      await banAndRemoveUserData(row.id);
      await loadRows();
    } catch (e) {
      setErr(e?.message || '삭제에 실패했습니다. 마스터 권한·Firestore 규칙을 확인하세요.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveUnlock = async () => {
    if (!unlockTarget?.id) return;
    setUnlockBusy(true);
    setUnlockErr('');
    try {
      await setUserPackUnlockBonus(unlockTarget.id, unlockDraft);
      setUnlockTarget(null);
      await loadRows();
    } catch (e) {
      setUnlockErr(e?.message || '저장에 실패했습니다.');
    } finally {
      setUnlockBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-2 sm:p-4">
      <div className="bg-slate-800 border border-slate-600 rounded-2xl w-full max-w-[min(100vw-0.5rem,26rem)] lg:max-w-5xl max-h-[92vh] flex flex-col shadow-xl">
        <div className="flex justify-between items-center p-4 border-b border-slate-600 flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-amber-300 flex flex-wrap items-center gap-2">
              관리자 · 회원
              {master && (
                <span className="text-xs font-black rounded-full bg-red-900/80 text-red-100 px-2 py-0.5 border border-red-500/50">
                  마스터
                </span>
              )}
            </h2>
            <p className="text-[11px] text-slate-500 mt-1 break-keep">
              {showStats && '기록·팩 진행 열람 '}
              {showStats && showUnlock && '· '}
              {showUnlock && '회원별 팩 추가 해제 '}
              {!showStats && !showUnlock && '권한이 없습니다.'}
            </p>
          </div>
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
            <>
              {/* 모바일·좁은 화면: 가로 한눈에 — 이름 4글자 축약, 카드 폭 좁게 */}
              <div className="lg:hidden space-y-2">
                {rows.map((r) => {
                  const pp = r.packProgress && typeof r.packProgress === 'object' ? r.packProgress : {};
                  const legal = r.displayName || '';
                  const shown = r.shownName || r.displayName || '';
                  return (
                    <div
                      key={r.id}
                      className="rounded-xl border border-slate-600/90 bg-slate-900/70 px-2.5 py-2 text-[11px] text-slate-200"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <span
                          className="font-bold text-amber-100/95 whitespace-nowrap shrink-0"
                          title={legal || undefined}
                        >
                          {shortName4(legal)}
                          {r.id === currentUid && <span className="ml-0.5 font-normal text-slate-500">(나)</span>}
                        </span>
                        <span className="text-slate-400 whitespace-nowrap shrink-0" title={shown || undefined}>
                          표시 {shortName4(shown)}
                        </span>
                        <span className="text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                          {r.birthDate || '—'}
                        </span>
                      </div>
                      {showStats && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-slate-700/80 pt-1.5 text-slate-400">
                          <span className="whitespace-nowrap">
                            인정 <span className="text-slate-200 tabular-nums font-medium">
                              {r.playStats?.eligibleLevelClears != null ? r.playStats.eligibleLevelClears : '—'}
                            </span>
                          </span>
                          <span className="whitespace-nowrap">
                            접속{' '}
                            <span className="text-slate-200">
                              {r.accessCount != null ? `${r.accessCount}회` : '—'}
                            </span>
                          </span>
                        </div>
                      )}
                      {showStats && (
                        <div className="mt-1.5 grid grid-cols-5 gap-x-1 gap-y-1 text-[9px] leading-tight">
                          {packKeys.map((k) => {
                            const v = pp[k];
                            const head = (PACK_DATA[k]?.name ?? k).slice(0, 4);
                            return (
                              <div key={k} className="min-w-0 text-center" title={PACK_DATA[k]?.name ?? k}>
                                <div className="text-slate-500 truncate">{head}</div>
                                <div className="tabular-nums text-slate-200">{v != null && v !== '' ? v : '—'}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {showUnlock && (
                          <button
                            type="button"
                            onClick={() => openUnlockModal(r)}
                            className="rounded-lg bg-amber-700/80 hover:bg-amber-600 px-2 py-1 text-[10px] font-bold text-white whitespace-nowrap"
                          >
                            팩 설정
                            {Array.isArray(r.packUnlockBonus) && r.packUnlockBonus.length > 0 ? (
                              <span className="ml-1 opacity-90">+{r.packUnlockBonus.length}</span>
                            ) : null}
                          </button>
                        )}
                        {master &&
                          (r.id === currentUid ? (
                            <span className="text-[10px] text-slate-500">삭제 불가(본인)</span>
                          ) : (
                            <button
                              type="button"
                              disabled={deleteBusy}
                              onClick={() => void handleDeleteMember(r)}
                              className="rounded-lg bg-rose-900/80 hover:bg-rose-800 border border-rose-600/50 px-2 py-1 text-[10px] font-bold text-rose-100 disabled:opacity-40 whitespace-nowrap"
                            >
                              삭제
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full text-left text-sm text-slate-200 border-collapse">
                <thead>
                  <tr className="border-b border-slate-600 text-slate-400">
                    <th className="py-2 pr-3 whitespace-nowrap">실명</th>
                    <th className="py-2 pr-3 whitespace-nowrap">표시 이름</th>
                    <th className="py-2 pr-3 whitespace-nowrap">생년월일</th>
                    {showStats && (
                      <th className="py-2 pr-3 whitespace-nowrap">인정 클리어</th>
                    )}
                    {showStats && <th className="py-2 pr-3">접속</th>}
                    {showStats &&
                      packKeys.map((k) => (
                        <th key={k} className="py-2 pr-2 whitespace-nowrap text-[10px] font-normal max-w-[4rem]">
                          {PACK_DATA[k]?.name?.slice(0, 8) ?? k}
                        </th>
                      ))}
                    {showUnlock && (
                      <th className="py-2 pr-3 whitespace-nowrap text-amber-200/90">추가 해제</th>
                    )}
                    {master && <th className="py-2 pr-3 whitespace-nowrap text-rose-200/90">회원 삭제</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-700/80">
                      <td className="py-2 pr-3 whitespace-nowrap max-w-[12rem] truncate" title={r.displayName || undefined}>
                        {r.displayName || '—'}
                        {r.id === currentUid && (
                          <span className="ml-1 text-[10px] text-slate-500">(나)</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap max-w-[10rem] truncate" title={(r.shownName || r.displayName) || undefined}>{r.shownName || r.displayName || '—'}</td>
                      <td className="py-2 pr-3 text-xs tabular-nums whitespace-nowrap">{r.birthDate || '—'}</td>
                      {showStats && (
                        <td className="py-2 pr-3 text-xs tabular-nums text-center">
                          {r.playStats?.eligibleLevelClears != null ? r.playStats.eligibleLevelClears : '—'}
                        </td>
                      )}
                      {showStats && (
                        <td className="py-2 pr-3 text-xs whitespace-nowrap">
                          {r.accessCount != null ? `${r.accessCount}회` : '—'}
                          <br />
                          <span className="text-slate-500">
                            {Array.isArray(r.accessHistory) && r.accessHistory.length > 0
                              ? r.accessHistory[r.accessHistory.length - 1]?.at?.slice?.(0, 16)
                              : ''}
                          </span>
                        </td>
                      )}
                      {showStats &&
                        packKeys.map((k) => {
                          const pp = r.packProgress && typeof r.packProgress === 'object' ? r.packProgress : {};
                          const v = pp[k];
                          return (
                            <td key={k} className="py-2 pr-2 text-center text-xs tabular-nums">
                              {v != null && v !== '' ? v : '—'}
                            </td>
                          );
                        })}
                      {showUnlock && (
                        <td className="py-2 pr-3">
                          <button
                            type="button"
                            onClick={() => openUnlockModal(r)}
                            className="rounded-lg bg-amber-700/80 hover:bg-amber-600 px-2 py-1 text-xs font-bold text-white whitespace-nowrap"
                          >
                            팩 설정
                          </button>
                          {Array.isArray(r.packUnlockBonus) && r.packUnlockBonus.length > 0 && (
                            <span className="block text-[10px] text-amber-200/80 mt-0.5">
                              +{r.packUnlockBonus.length}팩
                            </span>
                          )}
                        </td>
                      )}
                      {master && (
                        <td className="py-2 pr-3">
                          {r.id === currentUid ? (
                            <span className="text-[11px] text-slate-500">—</span>
                          ) : (
                            <button
                              type="button"
                              disabled={deleteBusy}
                              onClick={() => void handleDeleteMember(r)}
                              className="rounded-lg bg-rose-900/80 hover:bg-rose-800 border border-rose-600/50 px-2 py-1 text-[11px] font-bold text-rose-100 disabled:opacity-40"
                            >
                              삭제
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          <p className="text-[11px] text-slate-500 mt-4 break-keep">
            {showStats && (
              <>
                숫자는 해당 팩에서 달성한 최대 클리어 레벨입니다.
                <br />
              </>
            )}
            {showUnlock && (
              <>
                «추가 해제»는 진행도와 무관하게 해당 팩을 플레이 선택할 수 있게 합니다. Firestore{' '}
                <code className="text-slate-400">users.packUnlockBonus</code> 와 규칙이 필요합니다.
              </>
            )}
          </p>
        </div>
      </div>

      {unlockTarget && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-amber-600/40 rounded-2xl max-w-lg w-full p-5 shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-amber-200 mb-1 break-keep">
              {unlockTarget.displayName || '회원'} — 팩 추가 잠금 해제
            </h3>
            <p className="text-xs text-slate-500 mb-4 break-keep">
              체크한 팩은 순서 진행과 관계없이 로비에서 선택할 수 있습니다. 해제하면 해당 팩 체크를 끕니다.
            </p>
            {unlockErr && <p className="text-red-400 text-sm mb-2">{unlockErr}</p>}
            <div className="grid gap-2 mb-4">
              {packKeys.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 cursor-pointer text-sm text-slate-200 hover:bg-slate-800/80 rounded-lg px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={unlockDraft.includes(k)}
                    onChange={() => toggleUnlockPack(k)}
                    className="rounded border-slate-500"
                  />
                  <span>{PACK_DATA[k]?.name ?? k}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setUnlockTarget(null)}
                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-bold"
                disabled={unlockBusy}
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveUnlock}
                disabled={unlockBusy}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50"
              >
                {unlockBusy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
