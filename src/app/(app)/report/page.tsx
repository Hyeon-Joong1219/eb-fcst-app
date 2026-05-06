'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Download, FileSpreadsheet, RefreshCw, BarChart3, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const SNAPSHOT_MONTHS = [
  { value: 'JANUARY',  label: 'Jan (1월)' },
  { value: 'FEBRUARY', label: 'Feb (2월)' },
  { value: 'APRIL',    label: 'Apr (4월)' },
  { value: 'JUNE',     label: 'Jun (6월)' },
  { value: 'AUGUST',   label: 'Aug (8월)' },
  { value: 'OCTOBER',  label: 'Oct (10월)' },
  { value: 'NOVEMBER', label: 'Nov (11월)' },
  { value: 'DECEMBER', label: 'Dec (12월)' },
];

interface Summary {
  totalFyEur:   number;
  totalPyEur:   number;
  totalVsLy:    number | null;
  fxRate:       number;
  custCount:    number;
  lineCount:    number;
  tierA:        { count: number; fyEur: number };
  tierB:        { count: number; fyEur: number };
  tierC:        { count: number; fyEur: number };
  q1Eur:        number;
  q2Eur:        number;
  q3Eur:        number;
  q4Eur:        number;
  roRiskEur:    number;
  roOppEur:     number;
}

export default function ReportPage() {
  const [year, setYear]                 = useState(2025);
  const [snapshotMonth, setSnapshotMonth] = useState('NOVEMBER');
  const [summary, setSummary]           = useState<Summary | null>(null);
  const [loading, setLoading]           = useState(false);
  const [downloading, setDownloading]   = useState(false);
  const { data: session }               = useSession();
  const userRole = (session?.user as { role?: string })?.role ?? 'VIEWER';
  const canDownload = userRole === 'ADMIN';

  // ── 미리보기 데이터 로드 ─────────────────────────────────────────────────
  const loadSummary = useCallback(async () => {
    setLoading(true);
    setSummary(null);
    try {
      const [gridRes, roRes] = await Promise.all([
        fetch(`/api/forecast/grid-data?year=${year}&snapshotMonth=${snapshotMonth}`),
        fetch(`/api/ro?year=${year}`),
      ]);
      const gridData = await gridRes.json();
      const roData   = await roRes.json();

      const rows: any[]   = gridData.rows ?? [];
      const fxRate: number = gridData.fxRate ?? 1409;

      // 활성 행만 (FY > 0)
      const active = rows.filter(r => (r.fy_krw ?? 0) > 0);

      const totalFy = active.reduce((s: number, r: any) => s + (r.fy_krw ?? 0), 0);
      const totalPy = active.reduce((s: number, r: any) => s + (r.py_fy  ?? 0), 0);
      const vsLy    = totalPy > 0 ? ((totalFy - totalPy) / totalPy) * 100 : null;

      // 고객 집계
      const custMap = new Map<string, { tier: string; fy: number }>();
      active.forEach((r: any) => {
        const prev = custMap.get(r.customer_id) ?? { tier: r.customer_tier, fy: 0 };
        custMap.set(r.customer_id, { tier: r.customer_tier, fy: prev.fy + (r.fy_krw ?? 0) });
      });

      const tier = (t: string) => {
        const custs = Array.from(custMap.values()).filter(c => c.tier === t);
        return { count: custs.length, fyEur: Math.round(custs.reduce((s,c)=>s+c.fy,0) / fxRate) };
      };

      // R&O 합계
      const roItems: any[] = roData.items ?? [];
      const roRiskEur = Math.round(
        roItems.filter(i => i.type === 'RISK').reduce((s: number, i: any) => s + Number(i.weighted_amount_krw), 0) / fxRate
      );
      const roOppEur  = Math.round(
        roItems.filter(i => i.type === 'OPPORTUNITY').reduce((s: number, i: any) => s + Number(i.weighted_amount_krw), 0) / fxRate
      );

      // Q별 합계
      const qSum = (q: number) => Math.round(
        active.reduce((s: number, r: any) => s + (r[`py${q}`] !== undefined ? (r[`q${q}_krw`] ?? 0) : (r[`q${q}_krw`] ?? 0)), 0) / fxRate
      );

      setSummary({
        totalFyEur:  Math.round(totalFy / fxRate),
        totalPyEur:  Math.round(totalPy / fxRate),
        totalVsLy:   vsLy,
        fxRate,
        custCount:   custMap.size,
        lineCount:   active.length,
        tierA:       tier('A'),
        tierB:       tier('B'),
        tierC:       tier('C'),
        q1Eur: Math.round(active.reduce((s: number, r: any) => s + (r.q1_krw ?? 0), 0) / fxRate),
        q2Eur: Math.round(active.reduce((s: number, r: any) => s + (r.q2_krw ?? 0), 0) / fxRate),
        q3Eur: Math.round(active.reduce((s: number, r: any) => s + (r.q3_krw ?? 0), 0) / fxRate),
        q4Eur: Math.round(active.reduce((s: number, r: any) => s + (r.q4_krw ?? 0), 0) / fxRate),
        roRiskEur,
        roOppEur,
      });
    } finally {
      setLoading(false);
    }
  }, [year, snapshotMonth]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  // ── Excel 다운로드 ────────────────────────────────────────────────────────
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/forecast/export?year=${year}&snapshotMonth=${snapshotMonth}`);
      if (!res.ok) { alert('다운로드 실패'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `EB_FCST_${year}_${snapshotMonth}_${new Date().toISOString().slice(0,10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  const fmt = (n: number) => `€${n.toLocaleString('ko-KR')}`;
  const pct = (v: number | null | undefined) =>
    v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;

  return (
    <main className="min-h-screen bg-slate-50">

      {/* 헤더 */}
      <div className="bg-white border-b px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <FileSpreadsheet size={22} className="text-blue-700" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">리포트 / Excel 내보내기</h1>
              <p className="text-xs text-slate-400 mt-0.5">스냅샷을 선택하여 Excel 리포트를 다운로드하세요</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 연도 */}
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="pl-3 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundColor: 'white',
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '14px',
              }}
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>

            {/* 스냅샷 월 */}
            <select
              value={snapshotMonth}
              onChange={e => setSnapshotMonth(e.target.value)}
              className="pl-3 pr-7 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              style={{
                WebkitAppearance: 'none',
                MozAppearance: 'none',
                appearance: 'none',
                backgroundColor: 'white',
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '14px',
              }}
            >
              {SNAPSHOT_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            <button
              onClick={loadSummary}
              disabled={loading}
              className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              title="새로고침"
            >
              <RefreshCw size={14} className={cn('text-slate-500', loading && 'animate-spin')} />
            </button>

            {/* 다운로드 버튼 — Admin만 표시 */}
            {canDownload && (
              <button
                onClick={handleDownload}
                disabled={downloading || loading || !summary}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm',
                  'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                <Download size={15} />
                {downloading ? '생성 중...' : 'Excel 다운로드'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

        {/* 리포트 구성 안내 */}
        <div className="bg-white rounded-2xl border shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-5 bg-blue-600 rounded-full" />
            Excel 파일 구성 (5개 시트)
          </h2>
          <div className="grid grid-cols-5 gap-3">
            {[
              { num: '1', name: '요약',        desc: 'KPI 합계, Tier별/분기별 집계', color: 'bg-blue-50 border-blue-200 text-blue-700' },
              { num: '2', name: 'FCST 상세',   desc: '고객×SBU 전체 라인 (메모 포함)', color: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
              { num: '3', name: '고객별 합산', desc: '고객 단위 Q1~Q4 + FY 집계', color: 'bg-violet-50 border-violet-200 text-violet-700' },
              { num: '4', name: 'SBU별 합산',  desc: 'SBU 단위 BF 그룹별 집계', color: 'bg-amber-50 border-amber-200 text-amber-700' },
              { num: '5', name: 'R&O',          desc: 'Risk & Opportunity 가중 금액', color: 'bg-rose-50 border-rose-200 text-rose-700' },
            ].map(s => (
              <div key={s.num} className={cn('rounded-xl border p-3 text-center', s.color)}>
                <div className="text-xs font-bold opacity-60 mb-1">Sheet {s.num}</div>
                <div className="font-bold text-sm">{s.name}</div>
                <div className="text-xs opacity-70 mt-1 leading-tight">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 미리보기 */}
        {loading ? (
          <div className="bg-white rounded-2xl border shadow-sm p-10 flex items-center justify-center gap-3 text-slate-400">
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-sm">데이터 불러오는 중...</span>
          </div>
        ) : summary ? (
          <>
            {/* 전체 KPI */}
            <div className="bg-white rounded-2xl border shadow-sm p-5">
              <h2 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <span className="w-1.5 h-5 bg-emerald-500 rounded-full" />
                {year}년 {SNAPSHOT_MONTHS.find(m => m.value === snapshotMonth)?.label} 스냅샷 미리보기
              </h2>

              <div className="grid grid-cols-4 gap-3 mb-4">
                <KpiCard
                  label="FY FCST (EUR)"
                  value={fmt(summary.totalFyEur)}
                  sub={`${summary.custCount}개 고객 · ${summary.lineCount}개 라인`}
                  color="text-blue-700"
                  icon={<BarChart3 size={18} className="text-blue-500" />}
                  bg="bg-blue-50"
                />
                <KpiCard
                  label={`PY (${year - 1}) Actual`}
                  value={fmt(summary.totalPyEur)}
                  sub={`OP Rate: 1€ = ${summary.fxRate.toLocaleString()}₩`}
                  color="text-slate-700"
                  icon={<BarChart3 size={18} className="text-slate-400" />}
                  bg="bg-slate-50"
                />
                <KpiCard
                  label="vs LY"
                  value={pct(summary.totalVsLy)}
                  sub="전년 대비 성장률"
                  color={summary.totalVsLy == null ? 'text-slate-400' : summary.totalVsLy >= 0 ? 'text-green-700' : 'text-red-600'}
                  icon={summary.totalVsLy != null && summary.totalVsLy >= 0
                    ? <TrendingUp size={18} className="text-green-500" />
                    : <TrendingDown size={18} className="text-red-400" />}
                  bg={summary.totalVsLy == null ? 'bg-slate-50' : summary.totalVsLy >= 0 ? 'bg-green-50' : 'bg-red-50'}
                />
                <KpiCard
                  label="R&O Net"
                  value={fmt(summary.roOppEur - summary.roRiskEur)}
                  sub={`Risk ${fmt(summary.roRiskEur)} | Opp ${fmt(summary.roOppEur)}`}
                  color={(summary.roOppEur - summary.roRiskEur) >= 0 ? 'text-emerald-700' : 'text-red-600'}
                  icon={<TrendingUp size={18} className="text-emerald-500" />}
                  bg="bg-emerald-50"
                />
              </div>

              {/* Tier + 분기별 */}
              <div className="grid grid-cols-2 gap-4">

                {/* Tier 테이블 */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                    <Users size={13} />  Tier별 FCST
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">Tier</th>
                        <th className="px-3 py-2 text-right font-semibold">고객 수</th>
                        <th className="px-3 py-2 text-right font-semibold">FY EUR</th>
                        <th className="px-3 py-2 text-right font-semibold">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { tier: 'A', data: summary.tierA, bg: 'bg-amber-50', badge: 'bg-amber-200 text-amber-800' },
                        { tier: 'B', data: summary.tierB, bg: 'bg-blue-50',  badge: 'bg-blue-200 text-blue-800' },
                        { tier: 'C', data: summary.tierC, bg: '',             badge: 'bg-slate-200 text-slate-600' },
                      ].map(({ tier, data, bg, badge }) => (
                        <tr key={tier} className={cn('border-t', bg)}>
                          <td className="px-3 py-2">
                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-bold', badge)}>{tier}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">{data.count}개</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(data.fyEur)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {summary.totalFyEur > 0 ? `${((data.fyEur / summary.totalFyEur) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 분기별 테이블 */}
                <div className="rounded-xl border overflow-hidden">
                  <div className="bg-slate-700 text-white px-4 py-2 text-xs font-bold flex items-center gap-2">
                    <BarChart3 size={13} />  분기별 FCST
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-3 py-2 text-left font-semibold">분기</th>
                        <th className="px-3 py-2 text-right font-semibold">FY EUR</th>
                        <th className="px-3 py-2 text-right font-semibold">비중</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { q: 'Q1', eur: summary.q1Eur },
                        { q: 'Q2', eur: summary.q2Eur },
                        { q: 'Q3', eur: summary.q3Eur },
                        { q: 'Q4', eur: summary.q4Eur },
                      ].map(({ q, eur }, i) => (
                        <tr key={q} className={cn('border-t', i % 2 === 0 ? 'bg-white' : 'bg-slate-50')}>
                          <td className="px-3 py-2 font-semibold text-slate-700">{q}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(eur)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {summary.totalFyEur > 0 ? `${((eur / summary.totalFyEur) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t bg-blue-50">
                        <td className="px-3 py-2 font-bold text-blue-700">FY 합계</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{fmt(summary.totalFyEur)}</td>
                        <td className="px-3 py-2 text-right text-blue-500">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

              </div>
            </div>

            {/* 다운로드 CTA */}
            <div className="bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-6 flex items-center justify-between text-white shadow-lg">
              <div>
                <p className="font-bold text-lg">Excel 리포트 다운로드</p>
                <p className="text-blue-200 text-sm mt-1">
                  {year}년 {SNAPSHOT_MONTHS.find(m => m.value === snapshotMonth)?.label} 스냅샷 · 5개 시트 · 셀 메모 포함
                </p>
              </div>
              {canDownload && (
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2.5 px-6 py-3 bg-white text-blue-800 rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors disabled:opacity-60 shadow"
                >
                  <Download size={16} />
                  {downloading ? '생성 중...' : 'Excel 다운로드'}
                </button>
              )}
            </div>
          </>
        ) : null}

      </div>
    </main>
  );
}

function KpiCard({
  label, value, sub, color, icon, bg,
}: {
  label: string; value: string; sub: string;
  color: string; icon: React.ReactNode; bg: string;
}) {
  return (
    <div className={cn('rounded-xl border p-4 flex items-start gap-3', bg)}>
      <div className="p-1.5 bg-white rounded-lg shadow-sm flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium mb-0.5">{label}</p>
        <p className={cn('text-xl font-bold leading-tight', color)}>{value}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>
      </div>
    </div>
  );
}
