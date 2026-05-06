import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  // 존재하는 모든 year × snapshot_month 조합 조회
  const snapshots = await prisma.forecastLine.groupBy({
    by: ['year', 'snapshot_month'],
    where: {},
    _count: { id: true },
    _sum: { amount_krw: true },
    orderBy: [{ year: 'desc' }, { snapshot_month: 'asc' }],
  });

  // 각 스냅샷의 잠금 여부 확인
  const lockChecks = await Promise.all(
    snapshots.map(s =>
      prisma.forecastLine.count({
        where: {
          year: s.year,
          snapshot_month: s.snapshot_month,
          status: 'LOCKED' as never,
        },
      })
    )
  );

  // OP FX rate 맵: year → rate
  const fxRates = await prisma.fxRate.findMany({
    where: { currency: 'EUR', is_op_rate: true },
  });
  const fxMap = new Map(fxRates.map(f => [f.year, parseFloat(f.rate.toString())]));

  // 스냅샷별 마지막 수정일 (updated_at 최댓값)
  const lastUpdates = await Promise.all(
    snapshots.map(s =>
      prisma.forecastLine.findFirst({
        where: {
          year: s.year,
          snapshot_month: s.snapshot_month,
        },
        orderBy: { updated_at: 'desc' },
        select: { updated_at: true },
      })
    )
  );

  const MONTH_ORDER: Record<string, number> = {
    JANUARY: 1, FEBRUARY: 2, APRIL: 4, JUNE: 6,
    AUGUST: 8, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
  };

  const result = snapshots
    .map((s, i) => {
      const totalKrw = Number(s._sum.amount_krw ?? 0);
      const fx = fxMap.get(s.year) ?? 1409;
      const totalEur = fx > 0 ? Math.round(totalKrw / fx) : 0;
      const lockedCount = lockChecks[i];
      const totalCount = s._count.id;
      const isLocked = totalCount > 0 && lockedCount === totalCount;

      return {
        year: s.year,
        snapshotMonth: s.snapshot_month,
        monthOrder: MONTH_ORDER[s.snapshot_month as string] ?? 0,
        lineCount: totalCount,
        lockedCount,
        isLocked,
        totalKrw,
        totalEur,
        fxRate: fx,
        lastUpdated: lastUpdates[i]?.updated_at ?? null,
      };
    })
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.monthOrder - a.monthOrder;
    });

  return NextResponse.json({ snapshots: result });
}
