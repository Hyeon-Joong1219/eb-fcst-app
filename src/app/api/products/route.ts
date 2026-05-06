import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const products = await prisma.product.findMany({
    where: { is_active: true },
    select: {
      id: true, sbu_code: true, sbu_name: true,
      bf_code: true, bf_name: true, bu_code: true,
    },
    orderBy: [{ bu_code: 'asc' }, { bf_code: 'asc' }, { sbu_code: 'asc' }],
  });

  return NextResponse.json(products);
}
