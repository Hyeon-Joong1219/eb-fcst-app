import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ExcelJS from 'exceljs';

const MONTH_KR: Record<string, string> = {
  JANUARY: '1월', FEBRUARY: '2월', APRIL: '4월', JUNE: '6월',
  AUGUST: '8월', OCTOBER: '10월', NOVEMBER: '11월', DECEMBER: '12월',
};

// ── 색상 팔레트 ──────────────────────────────────────────────────────────────
const C = {
  NAVY:    '1E3A5F',
  BLUE:    '0072B5',
  TIER_A:  'FEF3C7',
  TIER_B:  'DBEAFE',
  TIER_C:  'F8FAFC',
  RISK:    'FEE2E2',
  OPP:     'D1FAE5',
  TOTAL:   'E0F2FE',
  WHITE:   'FFFFFF',
  GRAY:    'F8FAFC',
  ALT:     'F0F9FF',
  POS:     '15803D',
  NEG:     'DC2626',
  MID:     '94A3B8',
};

const FMT_KRW = '#,##0;(#,##0);"-"';
const FMT_EUR = '"€"#,##0;"(€"#,##0;"-"';
const FMT_PCT = '+0.0%;-0.0%;"-"';

// ── 헬퍼 ────────────────────────────────────────────────────────────────────
function applyHeaderStyle(row: ExcelJS.Row, bgHex = C.NAVY) {
  row.height = 26;
  row.eachCell(cell => {
    cell.font      = { bold: true, name: 'Arial', size: 9, color: { argb: 'FF' + C.WHITE } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right:  { style: 'thin', color: { argb: 'FFD1D5DB' } },
    };
  });
}

function applyDataStyle(cell: ExcelJS.Cell, bgHex?: string) {
  cell.font = { name: 'Arial', size: 9 };
  if (bgHex) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + bgHex } };
  cell.border = {
    top:    { style: 'hair', color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
    left:   { style: 'hair', color: { argb: 'FFE5E7EB' } },
    right:  { style: 'hair', color: { argb: 'FFE5E7EB' } },
  };
}

function applyRowStyle(row: ExcelJS.Row, bgHex?: string) {
  row.height = 18;
  row.eachCell({ includeEmpty: false }, cell => applyDataStyle(cell, bgHex));
}

function numRight(row: ExcelJS.Row, keys: string[], fmt: string) {
  keys.forEach(k => {
    const c = row.getCell(k);
    c.numFmt    = fmt;
    c.alignment = { horizontal: 'right', vertical: 'middle' };
  });
}

function pctColor(row: ExcelJS.Row, key: string | number, val: number | null) {
  const cell = row.getCell(key);
  cell.numFmt    = FMT_PCT;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
  if (val == null) {
    cell.font = { name: 'Arial', size: 9, color: { argb: 'FF' + C.MID } };
  } else {
    cell.font = { name: 'Arial', size: 9, color: { argb: val >= 0 ? 'FF' + C.POS : 'FF' + C.NEG } };
  }
}

function tierBg(tier: string) {
  return tier === 'A' ? C.TIER_A : tier === 'B' ? C.TIER_B : C.TIER_C;
}

// ── 메인 핸들러 ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const year          = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = searchParams.get('snapshotMonth') ?? 'NOVEMBER';
  const customerId    = searchParams.get('customerId') ?? null;   // 단일 고객 필터
  const role          = (session.user as { role?: string }).role;
  const userId        = session.user!.id!;

  // ── 데이터 병렬 로드 ─────────────────────────────────────────────────────
  const [lines, fxRateRow, customers, products, roItems, cellNoteRows, custMemoRows] = await Promise.all([
    prisma.forecastLine.findMany({
      where: {
        year,
        snapshot_month: snapshotMonth as never,
        ...(role === 'AM' ? { owner_id: userId } : {}),
        ...(customerId   ? { customer_id: customerId } : {}),
      },
    }),
    prisma.fxRate.findFirst({
      where: { year, currency: 'EUR', is_op_rate: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.customer.findMany({
      where: {
        ...(role === 'AM' ? { owner_id: userId } : {}),
        ...(customerId   ? { id: customerId } : {}),
      },
      include: { owner: { select: { name: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    prisma.product.findMany({
      where: { is_active: true },
      orderBy: [{ bu_code: 'asc' }, { bf_code: 'asc' }, { sbu_code: 'asc' }],
    }),
    prisma.rOItem.findMany({
      where: {
        year,
        ...(customerId ? { customer_id: customerId } : {}),
      },
      include: {
        customer: { select: { name: true, tier: true } },
        product:  { select: { sbu_code: true, sbu_name: true } },
      },
      orderBy: [{ type: 'asc' }, { customer_id: 'asc' }, { created_at: 'desc' }],
    }),
    (prisma as any).fcstCellNote.findMany({
      where: {
        year, snapshot_month: snapshotMonth,
        ...(customerId ? { customer_id: customerId } : {}),
      },
    }),
    (prisma as any).fcstCustomerMemo.findMany({
      where: {
        year, snapshot_month: snapshotMonth,
        ...(customerId ? { customer_id: customerId } : {}),
      },
    }),
  ]);

  // Actuals (전년 없으면 전전년)
  let actuals = await prisma.actual.findMany({ where: { year: year - 1 } });
  if (actuals.length === 0) actuals = await prisma.actual.findMany({ where: { year: year - 2 } });

  const fxRate = fxRateRow ? parseFloat(fxRateRow.rate.toString()) : 1409;

  // ── 맵 빌드 ──────────────────────────────────────────────────────────────
  const fcstMap = new Map<string, number>();
  lines.forEach(l => {
    const v = parseFloat(l.amount_krw?.toString() ?? l.amount.toString());
    fcstMap.set(`${l.customer_id}_${l.product_id}_${l.quarter}`, v);
  });

  const actualMap = new Map<string, number>();
  actuals.forEach(a => {
    actualMap.set(`${a.customer_id}_${a.product_id}_${a.quarter}`, parseFloat(a.amount_krw.toString()));
  });

  const noteMap = new Map<string, string>();
  cellNoteRows.forEach((n: any) =>
    noteMap.set(`${n.customer_id}_${n.product_id}_${n.quarter}`, n.note)
  );

  // 고객 탭 메모 맵: custId → memo 텍스트
  const custMemoMap = new Map<string, string>();
  custMemoRows.forEach((m: any) => custMemoMap.set(m.customer_id, m.memo));

  // ── 행 빌드 (빈 행 제외) ─────────────────────────────────────────────────
  interface DetailRow {
    tier: string; custId: string; custName: string; amName: string;
    buCode: string; bfName: string; sbuCode: string; sbuName: string;
    q1: number; q2: number; q3: number; q4: number; fy: number;
    fyEur: number; pyFy: number; vsLy: number | null;
    nq1: string; nq2: string; nq3: string; nq4: string;
    custMemo: string;   // 고객 탭 메모
  }

  const detailRows: DetailRow[] = [];
  const custAgg   = new Map<string, { tier: string; amName: string; q1: number; q2: number; q3: number; q4: number; pyFy: number }>();
  const sbuAgg    = new Map<string, { buCode: string; bfName: string; sbuCode: string; sbuName: string; q1: number; q2: number; q3: number; q4: number; pyFy: number }>();

  for (const cust of customers) {
    for (const prod of products) {
      const cid = cust.id, pid = prod.id;
      const q1 = fcstMap.get(`${cid}_${pid}_1`) ?? 0;
      const q2 = fcstMap.get(`${cid}_${pid}_2`) ?? 0;
      const q3 = fcstMap.get(`${cid}_${pid}_3`) ?? 0;
      const q4 = fcstMap.get(`${cid}_${pid}_4`) ?? 0;
      const fy = q1 + q2 + q3 + q4;

      // 셀 메모가 하나라도 있으면 금액이 0이어도 포함
      const hasNote = noteMap.has(`${cid}_${pid}_1`) || noteMap.has(`${cid}_${pid}_2`)
                   || noteMap.has(`${cid}_${pid}_3`) || noteMap.has(`${cid}_${pid}_4`);
      if (fy === 0 && !hasNote) continue;

      const py1 = actualMap.get(`${cid}_${pid}_1`) ?? 0;
      const py2 = actualMap.get(`${cid}_${pid}_2`) ?? 0;
      const py3 = actualMap.get(`${cid}_${pid}_3`) ?? 0;
      const py4 = actualMap.get(`${cid}_${pid}_4`) ?? 0;
      const pyFy = py1 + py2 + py3 + py4;

      detailRows.push({
        tier: cust.tier, custId: cid, custName: cust.name, amName: cust.owner.name,
        buCode: prod.bu_code, bfName: prod.bf_name, sbuCode: prod.sbu_code, sbuName: prod.sbu_name,
        q1, q2, q3, q4, fy,
        fyEur: Math.round(fy / fxRate),
        pyFy,
        vsLy: pyFy > 0 ? ((fy - pyFy) / pyFy) * 100 : null,
        nq1: noteMap.get(`${cid}_${pid}_1`) ?? '',
        nq2: noteMap.get(`${cid}_${pid}_2`) ?? '',
        nq3: noteMap.get(`${cid}_${pid}_3`) ?? '',
        nq4: noteMap.get(`${cid}_${pid}_4`) ?? '',
        custMemo: custMemoMap.get(cid) ?? '',
      });

      // 금액이 있는 행만 집계에 포함 (메모만 있는 빈 행은 합계에 영향 X)
      if (fy > 0) {
        const ca = custAgg.get(cid) ?? { tier: cust.tier, amName: cust.owner.name, q1:0, q2:0, q3:0, q4:0, pyFy:0 };
        ca.q1 += q1; ca.q2 += q2; ca.q3 += q3; ca.q4 += q4; ca.pyFy += pyFy;
        custAgg.set(cid, ca);

        const sa = sbuAgg.get(pid) ?? { buCode: prod.bu_code, bfName: prod.bf_name, sbuCode: prod.sbu_code, sbuName: prod.sbu_name, q1:0, q2:0, q3:0, q4:0, pyFy:0 };
        sa.q1 += q1; sa.q2 += q2; sa.q3 += q3; sa.q4 += q4; sa.pyFy += pyFy;
        sbuAgg.set(pid, sa);
      }
    }
  }

  detailRows.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    if (a.custName !== b.custName) return a.custName.localeCompare(b.custName);
    if (a.buCode !== b.buCode) return a.buCode.localeCompare(b.buCode);
    if (a.bfName !== b.bfName) return a.bfName.localeCompare(b.bfName);
    return a.sbuCode.localeCompare(b.sbuCode);
  });

  const totalFyKrw = detailRows.reduce((s, r) => s + r.fy,   0);
  const totalPyKrw = detailRows.reduce((s, r) => s + r.pyFy, 0);
  const totalFyEur = Math.round(totalFyKrw / fxRate);
  const totalPyEur = Math.round(totalPyKrw / fxRate);
  const totalVsLy  = totalPyKrw > 0 ? ((totalFyKrw - totalPyKrw) / totalPyKrw) * 100 : null;

  // ── ExcelJS Workbook ──────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator  = 'EB FCST App';
  wb.created  = new Date();
  wb.modified = new Date();

  // ═════════════════════════════════════════════════════════════════════════
  // Sheet 1: 요약 (Summary)
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet('요약');
    ws.columns = [{ width: 26 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 10 }];

    // 제목
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value     = `EB FCST Report — ${year}년 ${MONTH_KR[snapshotMonth] ?? snapshotMonth} Snapshot`;
    titleCell.font      = { bold: true, size: 14, name: 'Arial', color: { argb: 'FF' + C.NAVY } };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    ws.getRow(1).height = 38;

    const meta: [string, string][] = [
      ['생성 일시', new Date().toLocaleString('ko-KR')],
      ['OP FX Rate', `1 EUR = ${fxRate.toLocaleString('ko-KR')} KRW`],
      ['스냅샷', `${year}년 ${MONTH_KR[snapshotMonth] ?? snapshotMonth}`],
      ['FCST 고객 수', `${custAgg.size}개 고객 / ${detailRows.length}개 라인`],
    ];
    meta.forEach(([k, v]) => {
      const row = ws.addRow([k, v]);
      row.getCell(1).font = { bold: true, size: 9, name: 'Arial', color: { argb: 'FF' + C.NAVY } };
      row.getCell(2).font = { size: 9, name: 'Arial' };
      row.height = 16;
    });

    ws.addRow([]);

    // ── 전체 KPI ────────────────────────────────────────────────────────────
    const kpiHdr = ws.addRow(['구분', `FY ${year} FCST (EUR)`, `PY (${year-1}) Actual (EUR)`, 'vs LY %', '고객 수']);
    applyHeaderStyle(kpiHdr, C.NAVY);

    const totRow = ws.addRow([
      '전체 합계',
      totalFyEur || null,
      totalPyEur || null,
      totalVsLy != null ? totalVsLy / 100 : null,
      custAgg.size,
    ]);
    applyRowStyle(totRow, C.TOTAL);
    totRow.getCell(1).font      = { bold: true, name: 'Arial', size: 10 };
    totRow.getCell(2).numFmt    = FMT_EUR;
    totRow.getCell(2).alignment = { horizontal: 'right' };
    totRow.getCell(3).numFmt    = FMT_EUR;
    totRow.getCell(3).alignment = { horizontal: 'right' };
    pctColor(totRow, 4, totalVsLy);
    totRow.getCell(4).font      = { bold: true, name: 'Arial', size: 10, color: { argb: totalVsLy == null ? 'FF'+C.MID : totalVsLy >= 0 ? 'FF'+C.POS : 'FF'+C.NEG } };
    totRow.getCell(5).alignment = { horizontal: 'center' };
    totRow.height = 22;

    ws.addRow([]);

    // ── Tier별 ──────────────────────────────────────────────────────────────
    const tierHdr = ws.addRow(['Tier', `FY ${year} FCST (EUR)`, `PY (${year-1}) Actual (EUR)`, 'vs LY %', '고객 수']);
    applyHeaderStyle(tierHdr, C.BLUE);

    for (const tier of ['A', 'B', 'C'] as const) {
      const tierCusts = customers.filter(c => c.tier === tier && custAgg.has(c.id));
      let tfy = 0, tpy = 0;
      tierCusts.forEach(c => { const a = custAgg.get(c.id)!; tfy += a.q1+a.q2+a.q3+a.q4; tpy += a.pyFy; });
      const tvsly = tpy > 0 ? ((tfy - tpy) / tpy) * 100 : null;

      const tr = ws.addRow([
        `Tier ${tier}`,
        Math.round(tfy / fxRate) || null,
        Math.round(tpy / fxRate) || null,
        tvsly != null ? tvsly / 100 : null,
        tierCusts.length,
      ]);
      applyRowStyle(tr, tierBg(tier));
      tr.getCell(1).font      = { bold: true, name: 'Arial', size: 9 };
      tr.getCell(2).numFmt    = FMT_EUR;
      tr.getCell(2).alignment = { horizontal: 'right' };
      tr.getCell(3).numFmt    = FMT_EUR;
      tr.getCell(3).alignment = { horizontal: 'right' };
      pctColor(tr, 4, tvsly);
      tr.getCell(5).alignment = { horizontal: 'center' };
    }

    ws.addRow([]);

    // ── Q별 합계 ────────────────────────────────────────────────────────────
    const qHdr = ws.addRow(['분기', 'FCST KRW', 'FCST EUR', '', '']);
    applyHeaderStyle(qHdr, C.BLUE);

    ['Q1','Q2','Q3','Q4'].forEach((qLabel, i) => {
      const key = `q${i+1}` as 'q1'|'q2'|'q3'|'q4';
      const qKrw = detailRows.reduce((s, r) => s + r[key], 0);
      const qRow = ws.addRow([qLabel, qKrw || null, Math.round(qKrw / fxRate) || null, '', '']);
      applyRowStyle(qRow, C.GRAY);
      qRow.getCell(2).numFmt    = FMT_KRW;
      qRow.getCell(2).alignment = { horizontal: 'right' };
      qRow.getCell(3).numFmt    = FMT_EUR;
      qRow.getCell(3).alignment = { horizontal: 'right' };
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Sheet 2: FCST 상세
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet('FCST 상세');
    ws.columns = [
      { key: 'tier',  header: 'Tier',              width: 6  },
      { key: 'cust',  header: '고객사',             width: 22 },
      { key: 'am',    header: 'AM',                 width: 10 },
      { key: 'bu',    header: 'BU',                 width: 7  },
      { key: 'bf',    header: 'BF',                 width: 13 },
      { key: 'sbu',   header: 'SBU',                width: 28 },
      { key: 'q1',    header: 'Q1 KRW ✎',          width: 14 },
      { key: 'q2',    header: 'Q2 KRW ✎',          width: 14 },
      { key: 'q3',    header: 'Q3 KRW ✎',          width: 14 },
      { key: 'q4',    header: 'Q4 KRW ✎',          width: 14 },
      { key: 'fy',    header: 'FY KRW',             width: 16 },
      { key: 'fyEur', header: 'FY EUR',             width: 13 },
      { key: 'py',    header: `PY(${year-1}) EUR`,  width: 13 },
      { key: 'vsly',  header: 'vs LY %',            width: 10 },
    ];

    applyHeaderStyle(ws.getRow(1));
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    for (const r of detailRows) {
      const bg = tierBg(r.tier);
      const row = ws.addRow({
        tier: r.tier, cust: r.custName, am: r.amName,
        bu: r.buCode, bf: r.bfName, sbu: `${r.sbuCode}  ${r.sbuName}`,
        q1: r.q1 || null, q2: r.q2 || null, q3: r.q3 || null, q4: r.q4 || null,
        fy: r.fy || null,
        fyEur: r.fyEur || null,
        py: r.pyFy > 0 ? Math.round(r.pyFy / fxRate) : null,
        vsly: r.vsLy != null ? r.vsLy / 100 : null,
      });

      // 금액 없고 메모만 있는 행 → 연한 황색 배경으로 구분
      const noteOnlyRow = r.fy === 0;
      applyRowStyle(row, noteOnlyRow ? 'FFFBEB' : bg);
      numRight(row, ['q1','q2','q3','q4','fy'], FMT_KRW);
      numRight(row, ['fyEur','py'], FMT_EUR);
      pctColor(row, 'vsly', r.vsLy);
      row.getCell('tier').alignment = { horizontal: 'center', vertical: 'middle' };
      if (noteOnlyRow) {
        row.getCell('sbu').font = { name: 'Arial', size: 9, color: { argb: 'FF92400E' }, italic: true };
      }

      // ── Excel 네이티브 셀 코멘트 (빨간 삼각형 ▶ 호버 팝업) ──────────────
      const noteEntries: [string, string][] = [
        ['q1', r.nq1], ['q2', r.nq2], ['q3', r.nq3], ['q4', r.nq4],
      ];
      noteEntries.forEach(([key, text]) => {
        if (!text) return;
        const cell = row.getCell(key);
        // 메모 있는 Q셀 — 배경 살짝 강조 (앱 UI와 동일하게 황색)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        (cell as any).note = {
          texts: [{ font: { name: 'Arial', size: 9 }, text }],
        };
      });

      // 고객 탭 메모 → 고객사 셀에 Excel 코멘트
      if (r.custMemo) {
        (row.getCell('cust') as any).note = {
          texts: [
            { font: { name: 'Arial', size: 9, bold: true }, text: '고객 메모\n' },
            { font: { name: 'Arial', size: 9 }, text: r.custMemo },
          ],
        };
      }
    }

    // 합계 행
    const totRow = ws.addRow({
      tier: '', cust: '합계', am: '', bu: '', bf: '', sbu: '',
      q1: detailRows.reduce((s,r) => s+r.q1,0) || null,
      q2: detailRows.reduce((s,r) => s+r.q2,0) || null,
      q3: detailRows.reduce((s,r) => s+r.q3,0) || null,
      q4: detailRows.reduce((s,r) => s+r.q4,0) || null,
      fy: totalFyKrw || null,
      fyEur: totalFyEur || null,
      py: totalPyEur || null,
      vsly: totalVsLy != null ? totalVsLy / 100 : null,
    });
    totRow.height = 22;
    totRow.eachCell({ includeEmpty: false }, cell => {
      applyDataStyle(cell, C.TOTAL);
      cell.font   = { bold: true, name: 'Arial', size: 9 };
      cell.border = {
        top:    { style: 'medium', color: { argb: 'FF' + C.BLUE } },
        bottom: { style: 'thin',   color: { argb: 'FFD1D5DB' } },
        left:   { style: 'hair',   color: { argb: 'FFE5E7EB' } },
        right:  { style: 'hair',   color: { argb: 'FFE5E7EB' } },
      };
    });
    numRight(totRow, ['q1','q2','q3','q4','fy'], FMT_KRW);
    numRight(totRow, ['fyEur','py'], FMT_EUR);
    pctColor(totRow, 'vsly', totalVsLy);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Sheet 3: 고객별 합산
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet('고객별 합산');
    ws.columns = [
      { key: 'tier', header: 'Tier',             width: 6  },
      { key: 'cust', header: '고객사 ✎',          width: 26 },
      { key: 'am',   header: 'AM',                width: 10 },
      { key: 'q1',   header: 'Q1 EUR',            width: 13 },
      { key: 'q2',   header: 'Q2 EUR',            width: 13 },
      { key: 'q3',   header: 'Q3 EUR',            width: 13 },
      { key: 'q4',   header: 'Q4 EUR',            width: 13 },
      { key: 'fy',   header: 'FY EUR',            width: 13 },
      { key: 'py',   header: `PY(${year-1}) EUR`, width: 13 },
      { key: 'vsly', header: 'vs LY %',           width: 10 },
    ];
    applyHeaderStyle(ws.getRow(1));
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    for (const cust of customers) {
      const ca = custAgg.get(cust.id);
      if (!ca) continue;
      const fy   = ca.q1 + ca.q2 + ca.q3 + ca.q4;
      const vsly = ca.pyFy > 0 ? ((fy - ca.pyFy) / ca.pyFy) * 100 : null;
      const memo = custMemoMap.get(cust.id) ?? '';
      const row  = ws.addRow({
        tier: cust.tier, cust: cust.name, am: ca.amName,
        q1: Math.round(ca.q1 / fxRate) || null,
        q2: Math.round(ca.q2 / fxRate) || null,
        q3: Math.round(ca.q3 / fxRate) || null,
        q4: Math.round(ca.q4 / fxRate) || null,
        fy: Math.round(fy  / fxRate) || null,
        py: ca.pyFy > 0 ? Math.round(ca.pyFy / fxRate) : null,
        vsly: vsly != null ? vsly / 100 : null,
      });
      applyRowStyle(row, tierBg(cust.tier));
      numRight(row, ['q1','q2','q3','q4','fy','py'], FMT_EUR);
      pctColor(row, 'vsly', vsly);
      row.getCell('tier').alignment = { horizontal: 'center', vertical: 'middle' };

      // 고객 탭 메모 → 고객사 셀에 Excel 네이티브 코멘트
      if (memo) {
        const custCell = row.getCell('cust');
        custCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
        (custCell as any).note = {
          texts: [
            { font: { name: 'Arial', size: 9, bold: true }, text: '고객 메모\n' },
            { font: { name: 'Arial', size: 9 }, text: memo },
          ],
        };
      }
    }

    // 합계
    let sq1=0, sq2=0, sq3=0, sq4=0, spy=0;
    custAgg.forEach(ca => { sq1+=ca.q1; sq2+=ca.q2; sq3+=ca.q3; sq4+=ca.q4; spy+=ca.pyFy; });
    const sfy = sq1+sq2+sq3+sq4;
    const svsly = spy > 0 ? ((sfy-spy)/spy)*100 : null;
    const totRow = ws.addRow({
      tier:'', cust:'합계', am:'',
      q1: Math.round(sq1/fxRate)||null, q2: Math.round(sq2/fxRate)||null,
      q3: Math.round(sq3/fxRate)||null, q4: Math.round(sq4/fxRate)||null,
      fy: Math.round(sfy/fxRate)||null, py: spy>0?Math.round(spy/fxRate):null,
      vsly: svsly!=null ? svsly/100 : null,
    });
    totRow.height = 22;
    totRow.eachCell({ includeEmpty: false }, cell => {
      applyDataStyle(cell, C.TOTAL);
      cell.font = { bold: true, name: 'Arial', size: 9 };
    });
    numRight(totRow, ['q1','q2','q3','q4','fy','py'], FMT_EUR);
    pctColor(totRow, 'vsly', svsly);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Sheet 4: SBU별 합산
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet('SBU별 합산');
    ws.columns = [
      { key: 'bu',   header: 'BU',            width: 7  },
      { key: 'bf',   header: 'BF',            width: 14 },
      { key: 'sbu',  header: 'SBU',           width: 28 },
      { key: 'q1',   header: 'Q1 EUR',        width: 13 },
      { key: 'q2',   header: 'Q2 EUR',        width: 13 },
      { key: 'q3',   header: 'Q3 EUR',        width: 13 },
      { key: 'q4',   header: 'Q4 EUR',        width: 13 },
      { key: 'fy',   header: 'FY EUR',        width: 13 },
      { key: 'py',   header: `PY(${year-1}) EUR`, width: 13 },
      { key: 'vsly', header: 'vs LY %',       width: 10 },
    ];
    applyHeaderStyle(ws.getRow(1));
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    const sbuEntries = Array.from(sbuAgg.entries()).sort((a, b) => {
      const [, sa] = a; const [, sb] = b;
      if (sa.buCode !== sb.buCode) return sa.buCode.localeCompare(sb.buCode);
      if (sa.bfName !== sb.bfName) return sa.bfName.localeCompare(sb.bfName);
      return sa.sbuCode.localeCompare(sb.sbuCode);
    });

    let prevBf = '', altBg = false;
    for (const [, sa] of sbuEntries) {
      if (sa.bfName !== prevBf) { prevBf = sa.bfName; altBg = !altBg; }
      const fy   = sa.q1 + sa.q2 + sa.q3 + sa.q4;
      const vsly = sa.pyFy > 0 ? ((fy - sa.pyFy) / sa.pyFy) * 100 : null;
      const bg   = altBg ? C.ALT : C.WHITE;
      const row  = ws.addRow({
        bu: sa.buCode, bf: sa.bfName, sbu: `${sa.sbuCode}  ${sa.sbuName}`,
        q1: Math.round(sa.q1/fxRate)||null, q2: Math.round(sa.q2/fxRate)||null,
        q3: Math.round(sa.q3/fxRate)||null, q4: Math.round(sa.q4/fxRate)||null,
        fy: Math.round(fy/fxRate)||null,
        py: sa.pyFy>0 ? Math.round(sa.pyFy/fxRate) : null,
        vsly: vsly!=null ? vsly/100 : null,
      });
      applyRowStyle(row, bg);
      numRight(row, ['q1','q2','q3','q4','fy','py'], FMT_EUR);
      pctColor(row, 'vsly', vsly);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Sheet 5: R&O
  // ═════════════════════════════════════════════════════════════════════════
  {
    const ws = wb.addWorksheet('R&O');
    ws.columns = [
      { key: 'cust',     header: '고객사',        width: 22 },
      { key: 'type',     header: 'Type',          width: 13 },
      { key: 'quarter',  header: 'Quarter',       width: 10 },
      { key: 'sbu',      header: 'SBU / BF',      width: 22 },
      { key: 'level',    header: 'Possibility',   width: 12 },
      { key: 'weight',   header: 'Weight',        width: 9  },
      { key: 'raw',      header: 'Raw KRW',       width: 16 },
      { key: 'weighted', header: 'Weighted KRW',  width: 16 },
      { key: 'weur',     header: 'Weighted EUR',  width: 15 },
      { key: 'comment',  header: 'Comment',       width: 32 },
      { key: 'sfdc',     header: 'SFDC Link',     width: 22 },
    ];
    applyHeaderStyle(ws.getRow(1));
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    for (const item of roItems) {
      const bg   = item.type === 'RISK' ? C.RISK : C.OPP;
      const weur = Math.round(Number(item.weighted_amount_krw) / fxRate);
      const row  = ws.addRow({
        cust:     item.customer.name,
        type:     item.type,
        quarter:  item.quarter ? `Q${item.quarter}` : '전체',
        sbu:      item.product ? `${item.product.sbu_code} ${item.product.sbu_name}` : (item as any).bf_code ?? '',
        level:    item.level,
        weight:   Number(item.weight),
        raw:      Number(item.raw_amount),
        weighted: Number(item.weighted_amount_krw),
        weur,
        comment:  item.comment,
        sfdc:     (item as any).sfdc_link ?? '',
      });
      applyRowStyle(row, bg);
      row.getCell('type').font      = { bold: true, name: 'Arial', size: 9, color: { argb: item.type === 'RISK' ? 'FFDC2626' : 'FF15803D' } };
      row.getCell('level').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('weight').numFmt   = '0%';
      row.getCell('weight').alignment= { horizontal: 'center', vertical: 'middle' };
      numRight(row, ['raw','weighted'], FMT_KRW);
      numRight(row, ['weur'], FMT_EUR);
      row.getCell('comment').alignment = { wrapText: true, vertical: 'top' };
    }

    // R&O 합계
    if (roItems.length > 0) {
      const riskItems = roItems.filter(i => i.type === 'RISK');
      const oppItems  = roItems.filter(i => i.type === 'OPPORTUNITY');
      ws.addRow([]);
      const sumHdr = ws.addRow(['', 'Type', '', '', '', '', 'Raw KRW', 'Weighted KRW', 'Weighted EUR', '', '']);
      applyHeaderStyle(sumHdr, C.BLUE);

      const rRow = ws.addRow({
        cust: '', type: 'RISK 합계', quarter:'', sbu:'', level:'', weight: '',
        raw:      riskItems.reduce((s,i) => s + Number(i.raw_amount), 0) || null,
        weighted: riskItems.reduce((s,i) => s + Number(i.weighted_amount_krw), 0) || null,
        weur:     Math.round(riskItems.reduce((s,i) => s + Number(i.weighted_amount_krw), 0) / fxRate) || null,
      });
      applyRowStyle(rRow, C.RISK);
      rRow.getCell('type').font = { bold: true, name: 'Arial', size: 9, color: { argb: 'FFDC2626' } };
      numRight(rRow, ['raw','weighted'], FMT_KRW);
      numRight(rRow, ['weur'], FMT_EUR);

      const oRow = ws.addRow({
        cust: '', type: 'OPP 합계', quarter:'', sbu:'', level:'', weight: '',
        raw:      oppItems.reduce((s,i) => s + Number(i.raw_amount), 0) || null,
        weighted: oppItems.reduce((s,i) => s + Number(i.weighted_amount_krw), 0) || null,
        weur:     Math.round(oppItems.reduce((s,i) => s + Number(i.weighted_amount_krw), 0) / fxRate) || null,
      });
      applyRowStyle(oRow, C.OPP);
      oRow.getCell('type').font = { bold: true, name: 'Arial', size: 9, color: { argb: 'FF15803D' } };
      numRight(oRow, ['raw','weighted'], FMT_KRW);
      numRight(oRow, ['weur'], FMT_EUR);
    }
  }

  // ── 파일 반환 ─────────────────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer();
  const dateStr  = new Date().toISOString().slice(0, 10);
  const filename = `EB_FCST_${year}_${snapshotMonth}_${dateStr}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
