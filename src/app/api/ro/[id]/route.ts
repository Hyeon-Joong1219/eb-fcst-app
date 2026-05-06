import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const WEIGHT: Record<string, number> = { H: 0.75, M: 0.50, L: 0.25 };

const patchSchema = z.object({
  customer_id: z.string().optional(),
  product_id: z.string().nullable().optional(),
  bf_code: z.string().nullable().optional(),
  year: z.number().int().min(2020).max(2035).optional(),
  quarter: z.number().int().min(1).max(4).nullable().optional(),
  type: z.enum(['RISK', 'OPPORTUNITY']).optional(),
  level: z.enum(['H', 'M', 'L']).optional(),
  raw_amount_krw: z.number().optional(),
  comment: z.string().min(1).optional(),
  sfdc_link: z.string().nullable().optional(),
});

// PATCH /api/ro/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  const existing = await prisma.rOItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only owner, ADMIN, or MANAGER can edit
  if (role === 'AM' && existing.created_by !== userId) {
    return NextResponse.json({ error: '본인이 작성한 항목만 수정 가능합니다' }, { status: 403 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;

  // Resolve new level and raw_amount for weighted recalculation
  const newLevel = data.level ?? existing.level;
  const newRawAmount = data.raw_amount_krw ?? parseFloat(existing.raw_amount.toString());
  const newWeight = WEIGHT[newLevel as string];
  const newWeightedAmountKrw = newRawAmount * newWeight;

  const updated = await prisma.rOItem.update({
    where: { id },
    data: {
      ...(data.customer_id !== undefined ? { customer_id: data.customer_id } : {}),
      ...(data.product_id !== undefined ? { product_id: data.product_id } : {}),
      ...(data.bf_code !== undefined ? { bf_code: data.bf_code } : {}),
      ...(data.year !== undefined ? { year: data.year } : {}),
      ...(data.quarter !== undefined ? { quarter: data.quarter } : {}),
      ...(data.type !== undefined ? { type: data.type as never } : {}),
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.sfdc_link !== undefined ? { sfdc_link: data.sfdc_link } : {}),
      level: newLevel as never,
      weight: newWeight,
      raw_amount: newRawAmount,
      weighted_amount_krw: newWeightedAmountKrw,
    },
    include: {
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, sbu_code: true, sbu_name: true, bf_code: true } },
      creator: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/ro/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const role = (session.user as { role?: string }).role;
  const userId = session.user!.id!;

  const existing = await prisma.rOItem.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only owner, ADMIN, or MANAGER can delete
  const canDelete =
    existing.created_by === userId ||
    role === 'ADMIN' ||
    role === 'MANAGER';

  if (!canDelete) {
    return NextResponse.json({ error: '삭제 권한이 없습니다' }, { status: 403 });
  }

  await prisma.rOItem.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
