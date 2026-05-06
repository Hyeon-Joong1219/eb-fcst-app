import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// GET /api/forecast/memo?year=2025&snapshotMonth=NOVEMBER
// 해당 year+snapshotMonth의 모든 메모를 { customerId: memo } 맵으로 반환
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year          = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = searchParams.get('snapshotMonth') as string;
  if (!snapshotMonth) return NextResponse.json({ memos: {} });

  const rows = await (prisma as any).fcstCustomerMemo.findMany({
    where: { year, snapshot_month: snapshotMonth },
    select: { customer_id: true, memo: true },
  });

  const memos: Record<string, string> = {};
  rows.forEach((r: any) => { memos[r.customer_id] = r.memo; });

  return NextResponse.json({ memos });
}

const schema = z.object({
  customer_id:    z.string().min(1),
  year:           z.number().int(),
  snapshot_month: z.string().min(1),
  memo:           z.string(),
});

// POST /api/forecast/memo  (upsert)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { customer_id, year, snapshot_month, memo } = parsed.data;
  const userId = session.user!.id!;

  const record = await (prisma as any).fcstCustomerMemo.upsert({
    where: {
      customer_id_year_snapshot_month: { customer_id, year, snapshot_month },
    },
    update: { memo, updated_by: userId },
    create: { customer_id, year, snapshot_month: snapshot_month as never, memo, updated_by: userId },
  });

  return NextResponse.json({ ok: true, record });
}
