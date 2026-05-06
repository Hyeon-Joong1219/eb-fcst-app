'use client';

import { useEffect, useState } from 'react';
import { Lock, Unlock, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTH_KR: Record<string, string> = {
  JANUARY: 'Jan (1월)', FEBRUARY: 'Feb (2월)', APRIL: 'Apr (4월)',
  JUNE: 'Jun (6월)', AUGUST: 'Aug (8월)', OCTOBER: 'Oct (10월)',
  NOVEMBER: 'Nov (11월)', DECEMBER: 'Dec (12월)',
};

interface Snapshot {
  year: number;
  snapshotMonth: string;
  lineCount: number;
  lockedCount: number;
  isLocked: boolean;
  totalKrw: number;
  totalEur: number;
  fxRate: number;
  lastUpdated: string | null;
}

export default function SnapshotAdminPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch('/api/forecast/history');
    const data = await res.json();
    setSnapshots(data.snapshots ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleLock(s: Snapshot) {
    const key = `${s.year}_${s.snapshotMonth}`;
    setProcessing(key);
    setMessage(null);
    const action = s.isLocked ? 'unlock' : 'lock';
    const res = await fetch('/api/forecast/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: s.year, snapshotMonth: s.snapshotMonth, action }),
    });
    const data = await res.json();
    setProcessing(null);
    if (res.ok) {
      setMessage({ text: data.message, ok: true });
      await load();
    } else {
      setMessage({ text: data.error ?? '오류가 발생했습니다', ok: false });
    }
  }

  const byYear = snapshots.reduce<Record<number, Snapshot[]>>((acc, s) => {
    (acc[s.year] ??= []).push(s);
    return acc;
  }, {});
  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  return (
    <main className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">스냅샷 잠금 관리</h1>
          <p className="text-sm text-slate-500 mt-1">
            잠금된 스냅샷은 ADMIN만 편집 가능합니다. AM·MANAGER는 읽기 전용으로 전환됩니다.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
        >
          <RefreshCw size={14} /> 새로고침
        </button>
      </div>

      {/* 결과 메시지 */}
      {message && (
        <div className={cn(
          'mb-4 px-4 py-3 rounded-lg text-sm font-medium',
          message.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        )}>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-slate-400">불러오는 중...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-20 text-slate-400">저장된 FCST 스냅샷이 없습니다</div>
      ) : (
        <div className="space-y-8">
          {years.map(year => (
            <div key={year}>
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold text-slate-800">{year}년</h2>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">
                  잠금 {byYear[year].filter(s => s.isLocked).length} / {byYear[year].length}개
                </span>
              </div>

              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold text-slate-600">스냅샷</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">FY EUR</th>
                      <th className="text-right px-4 py-3 font-semibold text-slate-600">라인 수</th>
                      <th className="text-left px-4 py-3 font-semibold text-slate-600">마지막 수정</th>
                      <th className="text-center px-4 py-3 font-semibold text-slate-600">상태</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {byYear[year].map(s => {
                      const key = `${s.year}_${s.snapshotMonth}`;
                      const busy = processing === key;
                      return (
                        <tr key={key} className={cn('transition-colors', s.isLocked ? 'bg-red-50/30' : 'hover:bg-slate-50')}>
                          <td className="px-5 py-3.5 font-medium text-slate-900">
                            {MONTH_KR[s.snapshotMonth]}
                          </td>
                          <td className="px-4 py-3.5 text-right font-bold text-blue-700">
                            €{Math.round(s.totalEur / 1000).toLocaleString()}K
                          </td>
                          <td className="px-4 py-3.5 text-right text-slate-500">
                            {s.lockedCount > 0 && s.lockedCount < s.lineCount
                              ? <span className="text-amber-600">{s.lockedCount}/{s.lineCount}</span>
                              : s.lineCount.toLocaleString()
                            }
                          </td>
                          <td className="px-4 py-3.5 text-slate-500 text-xs">
                            {s.lastUpdated
                              ? new Date(s.lastUpdated).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : '—'}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold',
                              s.isLocked
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'
                            )}>
                              {s.isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                              {s.isLocked ? '잠금됨' : '편집 가능'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button
                              onClick={() => toggleLock(s)}
                              disabled={busy}
                              className={cn(
                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                                busy ? 'opacity-50 cursor-not-allowed' :
                                s.isLocked
                                  ? 'bg-white border-red-300 text-red-600 hover:bg-red-50'
                                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                              )}
                            >
                              {busy ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : s.isLocked ? (
                                <><Unlock size={12} /> 잠금 해제</>
                              ) : (
                                <><Lock size={12} /> 잠금</>
                              )}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
