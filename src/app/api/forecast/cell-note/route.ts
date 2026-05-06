import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// GET /api/forecast/cell-note?year=2025&snapshotMonth=NOVEMBER
// → { notes: { "custId_prodId_quarter": "메모 텍스트" } }
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year          = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = searchParams.get('snapshotMonth') as string;
  if (!snapshotMonth) return NextResponse.json({ notes: {} });

  const rows = await (prisma as any).fcstCellNote.findMany({
    where: { year, snapshot_month: snapshotMonth },
    select: { customer_id: true, product_id: true, quarter: true, note: true },
  });

  const notes: Record<string, string> = {};
  rows.forEach((r: any) => {
    notes[`${r.customer_id}_${r.product_id}_${r.quarter}`] = r.note;
  });

  return NextResponse.json({ notes });
}

const schema = z.object({
  customer_id:    z.string().min(1),
  product_id:     z.string().min(1),
  year:           z.number().int(),
  quarter:        z.number().int().min(1).max(4),
  snapshot_month: z.string().min(1),
  note:           z.string(),   // 빈 문자열이면 삭제
});

// POST /api/forecast/cell-note  (upsert, note="" 이면 삭제)
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const role = (session.user as { role?: string }).role;
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body   = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { customer_id, product_id, year, quarter, snapshot_month, note } = parsed.data;
  const userId = session.user!.id!;

  // 빈 문자열이면 기존 메모 삭제
  if (!note.trim()) {
    await (prisma as any).fcstCellNote.deleteMany({
      where: { customer_id, product_id, year, quarter, snapshot_month },
    });
    return NextResponse.json({ ok: true, deleted: true });
  }

  const record = await (prisma as any).fcstCellNote.upsert({
    where: {
      customer_id_product_id_year_quarter_snapshot_month: {
        customer_id, product_id, year, quarter, snapshot_month,
      },
    },
    update: { note, updated_by: userId },
    create: {
      customer_id, product_id, year, quarter,
      snapshot_month: snapshot_month as never,
      note, updated_by: userId,
    },
  });

  return NextResponse.json({ ok: true, record });
}
