import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function check() {
  const custs   = await p.customer.count();
  const actuals = await p.actual.count();
  const byYear  = await p.actual.groupBy({
    by: ['year'],
    _sum: { amount_krw: true },
    _count: { id: true },
  });

  console.log('고객 수:', custs);
  console.log('Actual 건수:', actuals);
  byYear.sort((a,b)=>a.year-b.year).forEach(r => {
    console.log(`${r.year}년: ${r._count.id}건, ${Math.round(Number(r._sum.amount_krw)/1e8)}억 KRW`);
  });

  const top = await p.actual.groupBy({
    by: ['customer_id'],
    _sum: { amount_krw: true },
    orderBy: { _sum: { amount_krw: 'desc' } },
    take: 5,
  });
  console.log('\nTop 5 고객사 (전체 기간):');
  for (const t of top) {
    const c = await p.customer.findUnique({ where: { id: t.customer_id }, select: { name: true, tier: true } });
    console.log(` [${c!.tier}] ${c!.name}: ${Math.round(Number(t._sum.amount_krw)/1e8)}억`);
  }
  await p.$disconnect();
}

check().catch(e => { console.error(e); p.$disconnect(); });
