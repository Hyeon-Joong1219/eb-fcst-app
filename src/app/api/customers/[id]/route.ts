import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  name_en: z.string().optional(),
  tier: z.enum(['A', 'B', 'C']).optional(),
  lifecycle_stage: z.enum(['DISCOVERY', 'PRECLIN', 'PHASE1', 'PHASE2', 'PHASE3', 'COMMERCIAL']).optional(),
  region: z.string().optional(),
  owner_id: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') return NextResponse.json({ error: '관리자만 고객 수정이 가능합니다' }, { status: 403 });

  const { id } = await params;
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.customer.update({
    where: { id },
    data: parsed.data,
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') return NextResponse.json({ error: '관리자만 고객 삭제가 가능합니다' }, { status: 403 });

  const { id } = await params;
  await prisma.customer.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
