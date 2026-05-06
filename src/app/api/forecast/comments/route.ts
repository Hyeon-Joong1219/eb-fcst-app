import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// GET /api/forecast/comments?year=2025&snapshotMonth=NOVEMBER
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = searchParams.get('snapshotMonth') as string;

  const comments = await (prisma as any).fcstRowComment.findMany({
    where: { year, snapshot_month: snapshotMonth },
  });

  // custId_prodId → { ly_comment, prev_comment }
  const map: Record<string, { ly_comment: string | null; prev_comment: string | null }> = {};
  comments.forEach((c: any) => {
    map[`${c.customer_id}_${c.product_id}`] = {
      ly_comment: c.ly_comment,
      prev_comment: c.prev_comment,
    };
  });

  return NextResponse.json({ comments: map });
}

const schema = z.object({
  customer_id: z.string(),
  product_id: z.string(),
  year: z.number().int(),
  snapshot_month: z.string(),
  ly_comment: z.string().nullable().optional(),
  prev_comment: z.string().nullable().optional(),
});

// POST /api/forecast/comments
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { customer_id, product_id, year, snapshot_month, ly_comment, prev_comment } = parsed.data;

  const record = await (prisma as any).fcstRowComment.upsert({
    where: {
      customer_id_product_id_year_snapshot_month: {
        customer_id, product_id, year, snapshot_month,
      },
    },
    update: {
      ...(ly_comment !== undefined ? { ly_comment } : {}),
      ...(prev_comment !== undefined ? { prev_comment } : {}),
    },
    create: { customer_id, product_id, year, snapshot_month: snapshot_month as never, ly_comment: ly_comment ?? null, prev_comment: prev_comment ?? null },
  });

  return NextResponse.json({ ok: true, record });
}
