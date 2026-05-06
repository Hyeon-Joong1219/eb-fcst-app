'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Unlock, ArrowRight, Calendar, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTH_KR: Record<string, string> = {
  JANUARY: '1월 (Jan)', FEBRUARY: '2월 (Feb)', APRIL: '4월 (Apr)',
  JUNE: '6월 (Jun)', AUGUST: '8월 (Aug)', OCTOBER: '10월 (Oct)',
  NOVEMBER: '11월 (Nov)', DECEMBER: '12월 (Dec)',
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

export default function ForecastHistoryPage() {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/forecast/history')
      .then(r => r.json())
      .then(d => { setSnapshots(d.snapshots ?? []); setLoading(false); });
  }, []);

  // 연도별 그룹핑
  const byYear = snapshots.reduce<Record<number, Snapshot[]>>((acc, s) => {
    (acc[s.year] ??= []).push(s);
    return acc;
  }, {});

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);

  function openFcst(s: Snapshot) {
    router.push(`/forecast?year=${s.year}&month=${s.snapshotMonth}`);
  }

  return (
    <main className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">FCST 이력</h1>
        <p className="text-slate-500 text-sm mt-1">
          저장된 모든 스냅샷 목록 — 잠금된 스냅샷은 ADMIN만 편집 가능합니다
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-slate-400">불러오는 중...</div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-20 text-slate-400">
          <FileText size={40} className="mx-auto mb-3 opacity-30" />
          <p>저장된 FCST 이력이 없습니다</p>
          <p className="text-xs mt-1">FCST 입력 페이지에서 데이터를 입력하면 여기에 표시됩니다</p>
        </div>
      ) : (
        <div className="space-y-8">
          {years.map(year => (
            <div key={year}>
              {/* 연도 헤더 */}
              <div className="flex items-center gap-3 mb-3">
                <h2 className="text-lg font-bold text-slate-800">{year}년</h2>
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">{byYear[year].length}개 스냅샷</span>
              </div>

              {/* 스냅샷 카드 목록 */}
              <div className="space-y-2">
                {byYear[year].map(s => (
                  <div
                    key={`${s.year}_${s.snapshotMonth}`}
                    className={cn(
                      'bg-white rounded-xl border shadow-sm p-5 flex items-center gap-5',
                      s.isLocked ? 'border-red-100' : 'border-slate-200'
                    )}
                  >
                    {/* 잠금 아이콘 */}
                    <div className={cn(
                      'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                      s.isLocked ? 'bg-red-100' : 'bg-blue-50'
                    )}>
                      {s.isLocked
                        ? <Lock size={18} className="text-red-500" />
                        : <Unlock size={18} className="text-blue-400" />
                      }
                    </div>

                    {/* 스냅샷 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-slate-900">{year}년 {MONTH_KR[s.snapshotMonth]}</span>
                        <span className={cn(
                          'text-xs px-2 py-0.5 rounded-full font-medium',
                          s.isLocked
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        )}>
                          {s.isLocked ? '잠금됨' : '편집 가능'}
                        </span>
                        {s.lockedCount > 0 && !s.isLocked && (
                          <span className="text-xs text-slate-400">
                            (일부 잠금 {s.lockedCount}/{s.lineCount})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {s.lastUpdated
                            ? new Date(s.lastUpdated).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </span>
                        <span>{s.lineCount.toLocaleString()} 라인</span>
                        <span>FX: {s.fxRate.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* 금액 */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-blue-700">
                        €{Math.round(s.totalEur / 1000).toLocaleString()}K
                      </p>
                      <p className="text-xs text-slate-400">
                        {Math.round(s.totalKrw / 1_000_000).toLocaleString()} 백만원
                      </p>
                    </div>

                    {/* 열기 버튼 */}
                    <button
                      onClick={() => openFcst(s)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0"
                    >
                      열기 <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
