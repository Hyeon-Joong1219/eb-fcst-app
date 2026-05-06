import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

// 스냅샷 월 순서 (연중 순서)
const MONTH_ORDER: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, APRIL: 4, JUNE: 6,
  AUGUST: 8, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = (searchParams.get('snapshotMonth') ?? 'NOVEMBER') as string;
  const role = (session.user as { role?: string }).role ?? 'VIEWER';
  const userId = session.user!.id!;
  const isAdmin = role === 'ADMIN';

  const [lines, fxRate, customers, products] = await Promise.all([
    prisma.forecastLine.findMany({
      where: {
        year,
        snapshot_month: snapshotMonth as never,
      },
    }),
    prisma.fxRate.findFirst({
      where: { year, currency: 'EUR', is_op_rate: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.customer.findMany({
      where: {},
      include: { owner: { select: { id: true, name: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    prisma.product.findMany({
      where: { is_active: true },
      orderBy: [{ bu_code: 'asc' }, { bf_code: 'asc' }, { sbu_code: 'asc' }],
    }),
  ]);

  // 전년 Actuals — year-1 없으면 year-2 fallback
  let actuals = await prisma.actual.findMany({ where: { year: year - 1 } });
  if (actuals.length === 0) {
    actuals = await prisma.actual.findMany({ where: { year: year - 2 } });
  }

  // 이전 스냅샷 자동 감지 (같은 연도에서 현재보다 앞선 월 중 가장 최근)
  const currentOrder = MONTH_ORDER[snapshotMonth] ?? 0;
  const prevSnapshots = await prisma.forecastLine.groupBy({
    by: ['snapshot_month'],
    where: { year, snapshot_month: { not: snapshotMonth as never } },
    _count: { id: true },
  });
  const prevMonth = prevSnapshots
    .map(s => ({ month: s.snapshot_month as string, order: MONTH_ORDER[s.snapshot_month as string] ?? 0 }))
    .filter(s => s.order < currentOrder)
    .sort((a, b) => b.order - a.order)[0]?.month ?? null;

  // 이전 스냅샷 FCST 맵
  let prevFcstMap = new Map<string, number>();
  if (prevMonth) {
    const prevLines = await prisma.forecastLine.findMany({
      where: {
        year,
        snapshot_month: prevMonth as never,
      },
    });
    // custId_prodId → FY 합계
    const agg = new Map<string, number>();
    prevLines.forEach(l => {
      const key = `${l.customer_id}_${l.product_id}`;
      const val = parseFloat(l.amount_krw?.toString() ?? l.amount.toString());
      agg.set(key, (agg.get(key) ?? 0) + val);
    });
    prevFcstMap = agg;
  }

  // 코멘트 로드
  const rawComments = await (prisma as any).fcstRowComment.findMany({
    where: { year, snapshot_month: snapshotMonth },
  });
  const commentMap = new Map<string, { ly_comment: string | null; prev_comment: string | null }>();
  rawComments.forEach((c: any) => {
    commentMap.set(`${c.customer_id}_${c.product_id}`, {
      ly_comment: c.ly_comment,
      prev_comment: c.prev_comment,
    });
  });

  const fxRateValue = fxRate ? parseFloat(fxRate.rate.toString()) : 1409;

  // 스냅샷 잠금 여부: LOCKED 라인이 하나라도 있으면 잠금 상태
  const isLocked = lines.some(l => (l as any).status === 'LOCKED');

  // FCST 맵: custId_prodId_quarter → amount_krw
  const fcstMap = new Map<string, number>();
  lines.forEach(l => {
    const val = parseFloat(l.amount_krw?.toString() ?? l.amount.toString());
    fcstMap.set(`${l.customer_id}_${l.product_id}_${l.quarter}`, val);
  });

  // Actual 맵
  const actualMap = new Map<string, number>();
  actuals.forEach(a => {
    actualMap.set(`${a.customer_id}_${a.product_id}_${a.quarter}`, parseFloat(a.amount_krw.toString()));
  });

  // 모든 고객 × 모든 SBU 행 생성
  const rows: object[] = [];

  for (const customer of customers) {
    for (const product of products) {
      const custId = customer.id;
      const prodId = product.id;

      const q1 = fcstMap.get(`${custId}_${prodId}_1`) ?? null;
      const q2 = fcstMap.get(`${custId}_${prodId}_2`) ?? null;
      const q3 = fcstMap.get(`${custId}_${prodId}_3`) ?? null;
      const q4 = fcstMap.get(`${custId}_${prodId}_4`) ?? null;
      const fySum = (q1 ?? 0) + (q2 ?? 0) + (q3 ?? 0) + (q4 ?? 0);
      const fy = fySum > 0 ? fySum : null;
      const fyEur = fy != null && fxRateValue > 0 ? Math.round(fy / fxRateValue) : null;

      const py1 = actualMap.get(`${custId}_${prodId}_1`) ?? null;
      const py2 = actualMap.get(`${custId}_${prodId}_2`) ?? null;
      const py3 = actualMap.get(`${custId}_${prodId}_3`) ?? null;
      const py4 = actualMap.get(`${custId}_${prodId}_4`) ?? null;
      const pyFySum = (py1 ?? 0) + (py2 ?? 0) + (py3 ?? 0) + (py4 ?? 0);
      const pyFy = pyFySum > 0 ? pyFySum : null;
      const vsLy = fy != null && pyFy ? ((fy - pyFy) / pyFy) * 100 : null;

      const pairKey = `${custId}_${prodId}`;
      const prevFy = prevFcstMap.get(pairKey) ?? null;
      const vsPrevPct = fy != null && prevFy ? ((fy - prevFy) / prevFy) * 100 : null;
      const cmt = commentMap.get(pairKey);

      rows.push({
        id: pairKey,
        customer_id: custId,
        customer_name: customer.name,
        customer_tier: customer.tier,
        lifecycle: customer.lifecycle_stage,
        am_name: customer.owner.name,
        product_id: prodId,
        sbu_code: product.sbu_code,
        sbu_name: product.sbu_name,
        bf_code: product.bf_code,
        bf_name: product.bf_name,
        bu_code: product.bu_code,
        q1_krw: q1, q2_krw: q2, q3_krw: q3, q4_krw: q4,
        fy_krw: fy, fy_eur: fyEur,
        py1, py2, py3, py4, py_fy: pyFy,
        vs_ly_pct: vsLy,
        ly_comment: cmt?.ly_comment ?? null,
        prev_fy_krw: prevFy,
        vs_prev_pct: vsPrevPct,
        prev_comment: cmt?.prev_comment ?? null,
        prev_snapshot_month: prevMonth,
      });
    }
  }

  // 정렬: Tier → 고객명 → BU → BF → SBU
  rows.sort((a: any, b: any) => {
    if (a.customer_tier !== b.customer_tier) return a.customer_tier.localeCompare(b.customer_tier);
    if (a.customer_name !== b.customer_name) return a.customer_name.localeCompare(b.customer_name);
    if (a.bu_code !== b.bu_code) return a.bu_code.localeCompare(b.bu_code);
    if (a.bf_code !== b.bf_code) return a.bf_code.localeCompare(b.bf_code);
    return a.sbu_code.localeCompare(b.sbu_code);
  });

  return NextResponse.json({ rows, fxRate: fxRateValue, year, snapshotMonth, isLocked, isAdmin, userRole: role, prevSnapshotMonth: prevMonth });
}
