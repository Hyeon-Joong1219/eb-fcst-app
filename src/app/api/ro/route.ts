import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Weight map for R&O levels
const WEIGHT: Record<string, number> = { H: 0.75, M: 0.50, L: 0.25 };

const MONTH_ORDER: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, APRIL: 4, JUNE: 6,
  AUGUST: 8, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

// GET /api/ro?year=2025&customerId=xxx
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
  const customerId = searchParams.get('customerId') ?? undefined;

  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  // Build customer scope filter
  const customerFilter = customerId
    ? { customer_id: customerId }
    : role === 'AM'
      ? { customer: { owner_id: userId } }
      : {};

  // Fetch R&O items with relations
  const items = await prisma.rOItem.findMany({
    where: { year, ...customerFilter },
    include: {
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, sbu_code: true, sbu_name: true, bf_code: true } },
      creator: { select: { id: true, name: true } },
    },
    orderBy: [{ customer_id: 'asc' }, { type: 'asc' }, { created_at: 'desc' }],
  });

  // Detect latest snapshot_month for FCST total
  const snapshots = await prisma.forecastLine.groupBy({
    by: ['snapshot_month'],
    where: {
      year,
      ...(customerId ? { customer_id: customerId } : {}),
      ...(role === 'AM' ? { owner_id: userId } : {}),
    },
    _count: { id: true },
  });

  const latestMonth = snapshots
    .sort((a, b) => (MONTH_ORDER[b.snapshot_month as string] ?? 0) - (MONTH_ORDER[a.snapshot_month as string] ?? 0))[0]
    ?.snapshot_month ?? null;

  // Compute FCST total KRW for latest snapshot
  let fcstKrw = 0;
  if (latestMonth) {
    const fcstAgg = await prisma.forecastLine.aggregate({
      where: {
        year,
        snapshot_month: latestMonth as never,
        ...(customerId ? { customer_id: customerId } : {}),
        ...(role === 'AM' ? { owner_id: userId } : {}),
      },
      _sum: { amount_krw: true },
    });
    fcstKrw = Number(fcstAgg._sum.amount_krw ?? 0);
  }

  // Fetch OP FX rate for the year
  const fxRateRow = await prisma.fxRate.findFirst({
    where: { year, currency: 'EUR', is_op_rate: true },
    orderBy: { created_at: 'desc' },
  });
  const fxRate = fxRateRow ? parseFloat(fxRateRow.rate.toString()) : 1400;

  return NextResponse.json({ items, fcstKrw, fxRate, year });
}

const createSchema = z.object({
  customer_id: z.string().min(1),
  product_id: z.string().optional(),
  bf_code: z.string().optional(),
  year: z.number().int().min(2020).max(2035),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['RISK', 'OPPORTUNITY']),
  level: z.enum(['H', 'M', 'L']),
  raw_amount_krw: z.number(),
  comment: z.string().min(1),
  sfdc_link: z.string().optional(),
});

// POST /api/ro — create new ROItem
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const {
    customer_id, product_id, bf_code, year, quarter,
    type, level, raw_amount_krw, comment, sfdc_link,
  } = parsed.data;

  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  // AM RBAC: only allowed to create for their own customers
  if (role === 'AM') {
    const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
    if (!customer || customer.owner_id !== userId) {
      return NextResponse.json({ error: '본인 담당 고객만 입력 가능합니다' }, { status: 403 });
    }
  }

  const weight = WEIGHT[level];
  const weighted_amount_krw = raw_amount_krw * weight;

  const item = await prisma.rOItem.create({
    data: {
      customer_id,
      product_id: product_id ?? null,
      bf_code: bf_code ?? null,
      year,
      quarter: quarter ?? null,
      type: type as never,
      level: level as never,
      weight,
      raw_amount: raw_amount_krw,
      currency: 'KRW',
      weighted_amount_krw,
      comment,
      sfdc_link: sfdc_link ?? null,
      created_by: userId,
    },
    include: {
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, sbu_code: true, sbu_name: true, bf_code: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(item, { status: 201 });
}
