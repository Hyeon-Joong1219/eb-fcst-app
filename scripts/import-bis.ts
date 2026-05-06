/**
 * BIS 데이터 임포트 스크립트
 * - 기존 mock 고객/매출 데이터 전체 삭제
 * - 2023 / 2024 / 2025 BIS .xls 파일에서 EB 관련 실제 데이터 임포트
 *
 * 대상 세그먼트: Biopharma, Biotech, CDMO
 * 대상 BU:      LP2, LP3 (LP7는 서비스로 제품 DB에 없음)
 *
 * 실행: npx tsx scripts/import-bis.ts
 */

import * as XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ─── BIS 파일 경로 ────────────────────────────────────────────────────────────
const BIS_FILES = [
  'C:/Users/M322017/OneDrive - MerckGroup/Documents/BIS/2023/202301-202312.xls',
  'C:/Users/M322017/OneDrive - MerckGroup/Documents/BIS/2024/202401-202412.xls',
  'C:/Users/M322017/OneDrive - MerckGroup/Documents/BIS/2025/202501-202512.xls',
];

// BIS column indices (0-based) — detected dynamically per file
// 2024/2025: Month is at col 1 (col 0 is blank padding)
// 2023:      Month is at col 0 (no padding)
interface ColMap {
  YEARMONTH: number;
  SOLD_TO:   number;
  NAME_KN:   number;
  SEGMENT:   number;
  BU:        number;
  PG:        number;
  SALES:     number;
}

function detectCols(headerRow: any[]): ColMap {
  // Find the "Month" column index
  const monthIdx = headerRow.findIndex(h => String(h).trim() === 'Month');
  const offset   = monthIdx; // shift everything by this offset
  return {
    YEARMONTH: offset + 0,
    SOLD_TO:   offset + 5,
    NAME_KN:   offset + 9,
    SEGMENT:   offset + 11,
    BU:        offset + 17,
    PG:        offset + 20,
    SALES:     offset + 28,
  };
}

const EB_SEGMENTS = new Set(['Biopharma', 'Biotech', 'CDMO']);
const EB_BUS      = new Set(['LP2', 'LP3']);

// month → quarter
function toQuarter(month: number): number {
  if (month <= 3) return 1;
  if (month <= 6) return 2;
  if (month <= 9) return 3;
  return 4;
}

// ─── BIS 파싱 ─────────────────────────────────────────────────────────────────
interface BisRow {
  year:      number;
  quarter:   number;
  soldTo:    string;
  nameKn:    string;
  sbuCode:   string;
  salesKrw:  number;
}

function parseBisFile(filePath: string): BisRow[] {
  const wb   = XLSX.readFile(filePath);
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const raw  = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

  // Header row is at index 4
  const COL = detectCols(raw[4]);

  const result: BisRow[] = [];

  for (let i = 5; i < raw.length; i++) {
    const r = raw[i];

    const ym      = Number(r[COL.YEARMONTH]);
    if (!ym || ym < 202100) continue;                 // 빈 행 스킵

    const year    = Math.floor(ym / 100);
    const month   = ym % 100;
    if (month < 1 || month > 12) continue;

    const segment = String(r[COL.SEGMENT] ?? '').trim();
    const bu      = String(r[COL.BU] ?? '').trim();

    if (!EB_SEGMENTS.has(segment)) continue;          // EB 세그먼트만
    if (!EB_BUS.has(bu)) continue;                    // LP2 / LP3만

    const soldTo  = String(r[COL.SOLD_TO] ?? '').trim();
    if (!soldTo)   continue;

    const nameKn  = String(r[COL.NAME_KN] ?? '').trim();
    const sbuCode = String(r[COL.PG] ?? '').trim();
    if (!sbuCode)  continue;

    const salesKrw = Number(r[COL.SALES]) || 0;
    if (salesKrw === 0) continue;                     // 0원 행 제외

    result.push({
      year,
      quarter: toQuarter(month),
      soldTo,
      nameKn,
      sbuCode,
      salesKrw,
    });
  }

  return result;
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== BIS 데이터 임포트 시작 ===\n');

  // 1. 기존 mock 데이터 삭제 (참조 무결성 순서 준수)
  console.log('▶ 기존 데이터 삭제 중...');
  await prisma.fcstRowComment.deleteMany();
  await prisma.fcstSnapshotLine.deleteMany();
  await prisma.fcstSnapshot.deleteMany();
  await prisma.rOItem.deleteMany();
  await prisma.forecastLine.deleteMany();
  await prisma.actual.deleteMany();
  await prisma.customer.deleteMany();
  console.log('  완료: 고객, FCST 라인, Actual, R&O 전체 삭제\n');

  // 2. 기준 데이터 로드 (Admin 유저, 제품 목록)
  const adminUser = await prisma.user.findFirst({
    where: { role: { in: ['ADMIN', 'MANAGER'] } },
    orderBy: { created_at: 'asc' },
  });
  if (!adminUser) throw new Error('ADMIN 또는 MANAGER 유저가 없습니다. 먼저 seed를 실행하세요.');
  console.log(`▶ 기본 담당자: ${adminUser.name} (${adminUser.role})`);

  const products = await prisma.product.findMany({ where: { is_active: true } });
  const sbuToProductId = new Map<string, string>(
    products.map(p => [p.sbu_code, p.id])
  );
  console.log(`▶ 제품 수: ${products.length}개 (sbu_code 매핑)\n`);

  // 3. BIS 파일 파싱
  console.log('▶ BIS 파일 파싱 중...');
  const allRows: BisRow[] = [];
  for (const file of BIS_FILES) {
    const rows = parseBisFile(file);
    console.log(`  ${file.split('/').pop()} → ${rows.length}행`);
    allRows.push(...rows);
  }
  console.log(`  합계: ${allRows.length}행\n`);

  // 4. 유효 행 필터링 (sbu_code가 제품 DB에 있는 것만)
  const validRows = allRows.filter(r => sbuToProductId.has(r.sbuCode));
  const skippedCodes = new Set(allRows.filter(r => !sbuToProductId.has(r.sbuCode)).map(r => r.sbuCode));
  if (skippedCodes.size > 0) {
    console.log(`⚠  제품 DB 미매칭 PG 코드 (스킵): ${[...skippedCodes].sort().join(', ')}\n`);
  }
  console.log(`▶ 유효 행: ${validRows.length}행\n`);

  // 5. 고객 집계 — sold-to별 총 매출 계산 (Tier 자동 지정용)
  const custSales  = new Map<string, number>(); // soldTo → total KRW
  const custNames  = new Map<string, string>();  // soldTo → 최신 nameKn
  for (const r of validRows) {
    custSales.set(r.soldTo, (custSales.get(r.soldTo) ?? 0) + r.salesKrw);
    if (r.nameKn) custNames.set(r.soldTo, r.nameKn);
  }
  const sortedSoldTos = [...custSales.entries()].sort((a, b) => b[1] - a[1]);
  const total = sortedSoldTos.length;

  // Tier 지정: 상위 20% → A, 다음 30% → B, 나머지 → C
  const tierMap = new Map<string, 'A' | 'B' | 'C'>();
  sortedSoldTos.forEach(([soldTo], idx) => {
    const pct = idx / total;
    tierMap.set(soldTo, pct < 0.20 ? 'A' : pct < 0.50 ? 'B' : 'C');
  });
  console.log(`▶ 고객 수: ${total}개 (A:${[...tierMap.values()].filter(t=>t==='A').length}, B:${[...tierMap.values()].filter(t=>t==='B').length}, C:${[...tierMap.values()].filter(t=>t==='C').length})\n`);

  // 6. 고객 INSERT
  console.log('▶ 고객 INSERT 중...');
  const soldToIdMap = new Map<string, string>(); // soldTo → customer DB id
  let custBatch = 0;
  for (const [soldTo] of sortedSoldTos) {
    const nameKn = custNames.get(soldTo) ?? soldTo;
    const tier   = tierMap.get(soldTo) ?? 'C';
    const cust   = await prisma.customer.create({
      data: {
        sold_to_code:    soldTo,
        name:            nameKn,
        tier:            tier as any,
        lifecycle_stage: 'DISCOVERY' as any,
        owner_id:        adminUser.id,
      },
    });
    soldToIdMap.set(soldTo, cust.id);
    custBatch++;
  }
  console.log(`  완료: ${custBatch}명 고객 생성\n`);

  // 7. Actuals 집계 — (soldTo, sbuCode, year, quarter) → 합계 KRW
  const actualAgg = new Map<string, number>();
  for (const r of validRows) {
    const custId = soldToIdMap.get(r.soldTo);
    const prodId = sbuToProductId.get(r.sbuCode);
    if (!custId || !prodId) continue;
    const key = `${custId}|${prodId}|${r.year}|${r.quarter}`;
    actualAgg.set(key, (actualAgg.get(key) ?? 0) + r.salesKrw);
  }
  console.log(`▶ Actual 집계 항목: ${actualAgg.size}개`);

  // 8. Actuals INSERT (배치)
  console.log('▶ Actuals INSERT 중...');
  const actualData = [...actualAgg.entries()].map(([key, amount]) => {
    const [customer_id, product_id, yearStr, quarterStr] = key.split('|');
    return {
      customer_id,
      product_id,
      year:        parseInt(yearStr),
      quarter:     parseInt(quarterStr),
      amount_krw:  amount,
      source:      'BIS',
    };
  });

  // createMany로 배치 삽입
  const BATCH = 500;
  for (let i = 0; i < actualData.length; i += BATCH) {
    await prisma.actual.createMany({ data: actualData.slice(i, i + BATCH) });
    process.stdout.write(`  ${Math.min(i + BATCH, actualData.length)}/${actualData.length}\r`);
  }
  console.log(`\n  완료: ${actualData.length}건 Actual 생성\n`);

  // 9. 요약
  console.log('=== 임포트 완료 ===');
  const years = [...new Set(actualData.map(a => a.year))].sort();
  for (const y of years) {
    const cnt = actualData.filter(a => a.year === y).length;
    const sum = actualData.filter(a => a.year === y).reduce((s, a) => s + Number(a.amount_krw), 0);
    console.log(`  ${y}: ${cnt}건, 합계 ${(sum/1e8).toFixed(1)}억 KRW`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
