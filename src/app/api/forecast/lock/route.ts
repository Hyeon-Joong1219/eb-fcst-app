import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  year: z.number().int(),
  snapshotMonth: z.string(),
  action: z.enum(['lock', 'unlock']),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') {
    return NextResponse.json({ error: 'ADMIN만 스냅샷을 잠금/해제할 수 있습니다' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { year, snapshotMonth, action } = parsed.data;

  const newStatus = action === 'lock' ? 'LOCKED' : 'DRAFT';

  const result = await prisma.forecastLine.updateMany({
    where: { year, snapshot_month: snapshotMonth as never },
    data: { status: newStatus as never },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      table: 'forecast_lines',
      row_id: `${year}_${snapshotMonth}`,
      before: { status: action === 'lock' ? 'DRAFT' : 'LOCKED' },
      after: { status: newStatus, affected_rows: result.count },
      user_id: session.user!.id!,
    },
  });

  return NextResponse.json({
    ok: true,
    action,
    affected: result.count,
    message: action === 'lock'
      ? `${year}년 ${snapshotMonth} 스냅샷이 잠금됐습니다 (${result.count}개 라인)`
      : `${year}년 ${snapshotMonth} 스냅샷 잠금이 해제됐습니다`,
  });
}
