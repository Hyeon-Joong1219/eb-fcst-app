import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const upsertSchema = z.object({
  year: z.number().int().min(2020).max(2035),
  currency: z.enum(['EUR', 'USD']),
  rate: z.number().positive(),
  is_op_rate: z.boolean(),
  note: z.string().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rates = await prisma.fxRate.findMany({
    orderBy: [{ year: 'desc' }, { currency: 'asc' }, { is_op_rate: 'desc' }],
  });
  return NextResponse.json(rates);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || (session.user as { role?: string }).role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { year, currency, rate, is_op_rate, note } = parsed.data;

  const fx = await prisma.fxRate.upsert({
    where: { year_currency_is_op_rate: { year, currency, is_op_rate } },
    update: { rate, note: note ?? null, created_by: session.user?.id },
    create: {
      year, currency, rate, is_op_rate,
      effective_from: new Date(`${year}-01-01`),
      note: note ?? null,
      created_by: session.user?.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      table: 'fx_rates',
      row_id: fx.id,
      after: { year, currency, rate, is_op_rate },
      user_id: session.user!.id!,
      reason: `FX rate ${currency}/KRW ${year} ${is_op_rate ? 'OP' : 'Actual'} 설정`,
    },
  });

  return NextResponse.json(fx);
}
