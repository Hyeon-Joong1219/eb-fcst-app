import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// GET /api/forecast?year=2025&snapshotMonth=NOVEMBER
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
  const snapshotMonth = searchParams.get('snapshotMonth') as string | null;
  const customerId = searchParams.get('customerId');

  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  // FCST 라인 조회
  const lines = await prisma.forecastLine.findMany({
    where: {
      year,
      ...(snapshotMonth ? { snapshot_month: snapshotMonth as never } : {}),
      ...(customerId ? { customer_id: customerId } : {}),
      ...(role === 'AM' ? { owner_id: userId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, tier: true, lifecycle_stage: true } },
      product: { select: { id: true, sbu_code: true, sbu_name: true, bf_code: true, bf_name: true, bu_code: true } },
    },
    orderBy: [{ customer_id: 'asc' }, { product_id: 'asc' }, { quarter: 'asc' }],
  });

  // OP FX rate (EUR) 조회
  const fxRate = await prisma.fxRate.findFirst({
    where: { year, currency: 'EUR', is_op_rate: true },
    orderBy: { created_at: 'desc' },
  });

  return NextResponse.json({ lines, fxRate });
}

const upsertSchema = z.object({
  customer_id: z.string(),
  product_id: z.string(),
  year: z.number().int(),
  quarter: z.number().int().min(1).max(4),
  snapshot_month: z.string(),
  amount_krw: z.number().min(0),
  comment: z.string().optional(),
  sfdc_oppty_id: z.string().optional(),
});

// POST /api/forecast — 단건 upsert
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { customer_id, product_id, year, quarter, snapshot_month, amount_krw, comment, sfdc_oppty_id } = parsed.data;
  const userId = session.user!.id!;
  const role = (session.user as { role?: string }).role;

  // VIEWER는 편집 불가
  if (role === 'VIEWER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // LOCKED 상태 체크
  const existing = await prisma.forecastLine.findUnique({
    where: { customer_id_product_id_year_quarter_snapshot_month: { customer_id, product_id, year, quarter, snapshot_month: snapshot_month as never } },
  });
  if (existing?.status === 'LOCKED') {
    return NextResponse.json({ error: '잠금된 FCST는 수정 불가. R&O로 반영하세요.' }, { status: 403 });
  }

  // AM RBAC
  const customer = await prisma.customer.findUnique({ where: { id: customer_id } });
  if (role === 'AM' && customer?.owner_id !== userId) {
    return NextResponse.json({ error: '본인 담당 고객만 입력 가능합니다' }, { status: 403 });
  }

  // OP FX rate 조회 → EUR 환산
  const fxRate = await prisma.fxRate.findFirst({
    where: { year, currency: 'EUR', is_op_rate: true },
    orderBy: { created_at: 'desc' },
  });
  const rateValue = fxRate ? parseFloat(fxRate.rate.toString()) : 1409;

  // 500K 이상 코멘트 체크
  if (amount_krw >= 500_000_000 && !comment?.trim()) {
    return NextResponse.json({ error: '5억 KRW 이상 입력 시 코멘트 필수입니다' }, { status: 400 });
  }

  const isHighlighted = existing ? parseFloat(existing.amount.toString()) !== amount_krw : false;

  const line = await prisma.forecastLine.upsert({
    where: {
      customer_id_product_id_year_quarter_snapshot_month: {
        customer_id, product_id, year, quarter, snapshot_month: snapshot_month as never,
      },
    },
    update: {
      amount: amount_krw,
      amount_krw,
      currency: 'KRW',
      comment: comment ?? null,
      sfdc_oppty_id: sfdc_oppty_id ?? null,
      is_highlighted: isHighlighted,
      updated_by: userId,
      prev_amount_krw: existing?.amount ?? null,
    },
    create: {
      customer_id, product_id, year, quarter,
      snapshot_month: snapshot_month as never,
      amount: amount_krw,
      amount_krw,
      currency: 'KRW',
      comment: comment ?? null,
      sfdc_oppty_id: sfdc_oppty_id ?? null,
      owner_id: userId,
      updated_by: userId,
      status: 'DRAFT',
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      table: 'forecast_lines',
      row_id: line.id,
      before: existing ? ({ amount_krw: existing.amount } as any) : undefined,
      after: { amount_krw, comment },
      user_id: userId,
    },
  });

  const eurAmount = rateValue > 0 ? amount_krw / rateValue : 0;
  return NextResponse.json({ ...line, amount_eur: eurAmount, fx_rate: rateValue });
}
