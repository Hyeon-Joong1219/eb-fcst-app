import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createSchema = z.object({
  sold_to_code: z.string().min(1),
  name: z.string().min(1),
  name_en: z.string().optional(),
  tier: z.enum(['A', 'B', 'C']),
  lifecycle_stage: z.enum(['DISCOVERY', 'PRECLIN', 'PHASE1', 'PHASE2', 'PHASE3', 'COMMERCIAL']),
  region: z.string().optional(),
  owner_id: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const tier = searchParams.get('tier');
  const lifecycle = searchParams.get('lifecycle');

  const customers = await prisma.customer.findMany({
    where: {
      ...(tier ? { tier: tier as 'A' | 'B' | 'C' } : {}),
      ...(lifecycle ? { lifecycle_stage: lifecycle as never } : {}),
    },
    include: { owner: { select: { id: true, name: true, name_en: true } } },
    orderBy: [{ tier: 'asc' }, { name: 'asc' }],
  });

  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string }).role;
  if (role !== 'ADMIN') return NextResponse.json({ error: '관리자만 고객 등록이 가능합니다' }, { status: 403 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const ownerId = parsed.data.owner_id ?? session.user!.id!;
  const customer = await prisma.customer.create({
    data: { ...parsed.data, owner_id: ownerId },
    include: { owner: { select: { id: true, name: true } } },
  });

  return NextResponse.json(customer, { status: 201 });
}
