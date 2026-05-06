import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import { Users, BarChart3, TrendingUp, ArrowRight, History, Lock } from 'lucide-react';

export default async function DashboardPage() {
  const session = await auth();
  const role    = (session?.user as { role?: string })?.role;
  const userId  = session?.user?.id!;
  const thisYear = new Date().getFullYear();
  const lastYear = thisYear - 1;

  const custWhere = role === 'AM' ? { owner_id: userId } : {};
  const fcstWhere = role === 'AM' ? { owner_id: userId } : {};

  const [
    customerCount,
    tierCounts,
    fxRate,
    actualThis,
    actualLast,
    fcstLines,
    latestSnapshot,
  ] = await Promise.all([
    prisma.customer.count({ where: custWhere }),
    prisma.customer.groupBy({ by: ['tier'], _count: true, where: custWhere }),
    prisma.fxRate.findFirst({
      where: { year: thisYear, currency: 'EUR', is_op_rate: true },
      orderBy: { created_at: 'desc' },
    }),
    // 올해 Actual (있으면)
    prisma.actual.aggregate({
      _sum: { amount_krw: true },
      where: { year: thisYear, ...(role === 'AM' ? { customer: { owner_id: userId } } : {}) },
    }),
    // 전년 Actual
    prisma.actual.aggregate({
      _sum: { amount_krw: true },
      where: { year: lastYear, ...(role === 'AM' ? { customer: { owner_id: userId } } : {}) },
    }),
    // 올해 FCST (가장 최근 스냅샷 기준 합계)
    prisma.forecastLine.aggregate({
      _sum: { amount_krw: true },
      where: { year: thisYear, ...fcstWhere },
    }),
    // 최근 스냅샷 정보
    prisma.forecastLine.findFirst({
      where: { year: thisYear },
      distinct: ['snapshot_month'],
      orderBy: { created_at: 'desc' },
      select: { snapshot_month: true, status: true },
    }),
  ]);

  const tierMap = Object.fromEntries(tierCounts.map(t => [t.tier, t._count]));
  const rate    = fxRate ? parseFloat(fxRate.rate.toString()) : null;

  const lyKrw   = Number(actualLast._sum.amount_krw ?? 0);
  const lyEur   = rate && lyKrw ? Math.round(lyKrw / rate) : null;

  const cyActKrw = Number(actualThis._sum.amount_krw ?? 0);
  const cyActEur = rate && cyActKrw ? Math.round(cyActKrw / rate) : null;

  const fcstKrw = Number(fcstLines._sum.amount_krw ?? 0);
  const fcstEur = rate && fcstKrw ? Math.round(fcstKrw / rate) : null;

  const vsLyPct = fcstEur && lyEur ? ((fcstEur - lyEur) / lyEur * 100) : null;

  const MONTH_KR: Record<string, string> = {
    JANUARY: 'Jan', FEBRUARY: 'Feb', APRIL: 'Apr',
    JUNE: 'Jun', AUGUST: 'Aug', OCTOBER: 'Oct',
    NOVEMBER: 'Nov', DECEMBER: 'Dec',
  };

  function fmtEur(eur: number | null) {
    if (!eur) return '—';
    return eur >= 1_000_000
      ? `€${(eur / 1_000_000).toFixed(1)}M`
      : `€${Math.round(eur / 1000).toLocaleString()}K`;
  }

  return (
    <main className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
        <p className="text-slate-500 mt-1">안녕하세요, {session?.user?.name}님 👋</p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        {/* 담당 고객 */}
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-500" />
            <p className="text-xs font-medium text-slate-500">담당 고객</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{customerCount}</p>
          <div className="flex gap-1.5 mt-2">
            {(['A', 'B', 'C'] as const).map(t => (
              <span key={t} className={`text-xs px-1.5 py-0.5 rounded font-bold ${t === 'A' ? 'bg-amber-100 text-amber-700' : t === 'B' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                {t}: {tierMap[t] ?? 0}
              </span>
            ))}
          </div>
        </div>

        {/* 전년 Actual */}
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-slate-400" />
            <p className="text-xs font-medium text-slate-500">{lastYear} Actual (FY)</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{fmtEur(lyEur)}</p>
          <p className="text-xs text-slate-400 mt-2">
            {lyKrw > 0 ? `${Math.round(lyKrw / 1e8).toLocaleString()}억 KRW` : '데이터 없음'}
          </p>
        </div>

        {/* 올해 FCST */}
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-blue-500" />
            <p className="text-xs font-medium text-slate-500">{thisYear} FCST (FY)</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">{fmtEur(fcstEur)}</p>
          <p className={`text-xs mt-2 font-medium ${vsLyPct == null ? 'text-slate-400' : vsLyPct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {vsLyPct != null
              ? `vs LY ${vsLyPct > 0 ? '+' : ''}${vsLyPct.toFixed(1)}%`
              : fcstKrw === 0 ? 'FCST 미입력' : 'LY 데이터 없음'}
          </p>
        </div>

        {/* OP FX */}
        <div className="bg-white rounded-xl border p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 size={16} className="text-amber-500" />
            <p className="text-xs font-medium text-slate-500">{thisYear} EUR OP Rate</p>
          </div>
          <p className="text-3xl font-bold text-slate-900">
            {rate ? rate.toLocaleString() : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            {rate ? `1 EUR = ${rate.toLocaleString()} KRW` : '/admin/fx 에서 설정하세요'}
          </p>
        </div>
      </div>

      {/* 스냅샷 상태 배너 */}
      {latestSnapshot && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 mb-6 flex items-center gap-3">
          <Lock size={14} className={latestSnapshot.status === 'LOCKED' ? 'text-red-500' : 'text-slate-400'} />
          <p className="text-sm text-slate-600">
            현재 스냅샷: <strong>{thisYear} {MONTH_KR[latestSnapshot.snapshot_month] ?? latestSnapshot.snapshot_month}</strong>
            &nbsp;—&nbsp;
            {latestSnapshot.status === 'LOCKED'
              ? <span className="text-red-600 font-medium">잠금됨 (ADMIN만 편집 가능)</span>
              : <span className="text-green-600 font-medium">편집 가능</span>}
          </p>
        </div>
      )}

      {/* 빠른 링크 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/customers" className="bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <p className="font-semibold text-slate-900">고객 관리</p>
            <p className="text-sm text-slate-500 mt-0.5">Tier 분류, 담당자 변경</p>
          </div>
          <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </Link>

        <Link href="/forecast" className="bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <p className="font-semibold text-slate-900">FCST 입력 그리드</p>
            <p className="text-sm text-slate-500 mt-0.5">KRW 입력 → EUR 자동 계산, Q1~Q4 + FY</p>
          </div>
          <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </Link>

        <Link href="/forecast/history" className="bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
          <div>
            <p className="font-semibold text-slate-900">FCST 이력</p>
            <p className="text-sm text-slate-500 mt-0.5">과거 스냅샷 조회</p>
          </div>
          <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
        </Link>

        {(role === 'ADMIN' || role === 'MANAGER') && (
          <Link href="/admin/fx" className="bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
            <div>
              <p className="font-semibold text-slate-900">FX 환율 설정</p>
              <p className="text-sm text-slate-500 mt-0.5">연도별 EUR/KRW OP Rate 설정</p>
            </div>
            <ArrowRight size={18} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
          </Link>
        )}
      </div>
    </main>
  );
}
