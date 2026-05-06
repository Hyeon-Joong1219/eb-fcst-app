import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import ExcelJS from 'exceljs';

const MONTH_ORDER: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, APRIL: 4, JUNE: 6,
  AUGUST: 8, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

const TIER_BG: Record<string, string> = {
  A: 'FEF3C7',
  B: 'DBEAFE',
  C: 'F8FAFC',
};

// Q 셀에 메모가 있을 때 적용할 황색 배경 (앱 UI와 동일)
const NOTE_BG = 'FEFCE8';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { searchParams } = new URL(req.url);
  const year          = parseInt(searchParams.get('year') ?? '2025');
  const snapshotMonth = searchParams.get('snapshotMonth') ?? 'NOVEMBER';
  const customerId    = searchParams.get('customerId') ?? null;
  const role          = (session.user as { role?: string }).role;
  const userId        = session.user!.id!;

  // ── 데이터 로드 ──────────────────────────────────────────────────────────
  const [lines, fxRateRow, customers, products, cellNoteRows, custMemoRows] = await Promise.all([
    prisma.forecastLine.findMany({
      where: {
        year,
        snapshot_month: snapshotMonth as never,
        ...(customerId     ? { customer_id: customerId } : {}),
      },
    }),
    prisma.fxRate.findFirst({
      where: { year, currency: 'EUR', is_op_rate: true },
      orderBy: { created_at: 'desc' },
    }),
    prisma.customer.findMany({
      where: {
        ...(customerId    ? { id: customerId } : {}),
      },
      include: { owner: { select: { name: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    }),
    prisma.product.findMany({
      where: { is_active: true },
      orderBy: [{ bu_code: 'asc' }, { bf_code: 'asc' }, { sbu_code: 'asc' }],
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

  // Actuals
  let actuals = await prisma.actual.findMany({ where: { year: year - 1 } });
  if (actuals.length === 0) actuals = await prisma.actual.findMany({ where: { year: year - 2 } });

  const fxRate = fxRateRow ? parseFloat(fxRateRow.rate.toString()) : 1409;

  // 이전 스냅샷 자동 감지
  const currentOrder = MONTH_ORDER[snapshotMonth] ?? 0;
  const prevSnapshots = await prisma.forecastLine.groupBy({
    by: ['snapshot_month'],
    where: { year, snapshot_month: { not: snapshotMonth as never } },
    _count: { id: true },
  });
  const prevMonth = prevSnapshots
    .map(s => ({ month: s.snapshot_month as string, order: MONTH_ORDER[s.snapshot_month as string] ?? 0 }))
    .filter(s => s.order < currentOrder)
    .sort((a, b) => b.order - a.order)[0]?.month ?? null;

  // 이전 스냅샷 FCST 맵
  const prevFcstMap = new Map<string, number>();
  if (prevMonth) {
    const prevLines = await prisma.forecastLine.findMany({
      where: { year, snapshot_month: prevMonth as never,
        ...(customerId ? { customer_id: customerId } : {}),
      },
    });
    prevLines.forEach(l => {
      const key = `${l.customer_id}_${l.product_id}`;
      const val = parseFloat(l.amount_krw?.toString() ?? l.amount.toString());
      prevFcstMap.set(key, (prevFcstMap.get(key) ?? 0) + val);
    });
  }

  // 코멘트 로드
  const rawComments = await (prisma as any).fcstRowComment.findMany({
    where: { year, snapshot_month: snapshotMonth,
      ...(customerId ? { customer_id: customerId } : {}),
    },
  });
  const commentMap = new Map<string, { ly_comment: string | null; prev_comment: string | null }>();
  rawComments.forEach((c: any) => {
    commentMap.set(`${c.customer_id}_${c.product_id}`, {
      ly_comment: c.ly_comment,
      prev_comment: c.prev_comment,
    });
  });

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

  const custMemoMap = new Map<string, string>();
  custMemoRows.forEach((m: any) => custMemoMap.set(m.customer_id, m.memo));

  // ── Excel 생성 ────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EB FCST App';
  wb.created = new Date();

  const isSingleCust = !!customerId || customers.length === 1;
  const custName     = isSingleCust ? (customers[0]?.name ?? '') : '전체';

  const ws = wb.addWorksheet(custName || 'FCST');

  // ── 컬럼 정의 (원래 CSV와 동일한 구조) ────────────────────────────────────
  const showCustCol = !isSingleCust; // 전체 탭이면 고객사 컬럼 표시

  const cols: Partial<ExcelJS.Column>[] = [];
  if (showCustCol) {
    cols.push({ key: 'custName', header: '고객사',  width: 22 });
    cols.push({ key: 'tier',     header: 'Tier',    width: 6  });
  }
  cols.push(
    { key: 'sbu',       header: 'SBU',                   width: 32 },
    { key: 'bf',        header: 'BF',                    width: 16 },
    { key: 'am',        header: 'AM',                    width: 10 },
    { key: 'q1',        header: 'Q1 (€)',                width: 14 },
    { key: 'q2',        header: 'Q2 (€)',                width: 14 },
    { key: 'q3',        header: 'Q3 (€)',                width: 14 },
    { key: 'q4',        header: 'Q4 (€)',                width: 14 },
    { key: 'fy',        header: 'FY (€)',                width: 14 },
    { key: 'py',        header: `PY (${year - 1})`,      width: 14 },
    { key: 'vsly',      header: 'vs LY %',               width: 10 },
    { key: 'lyCmt',     header: 'vs LY 코멘트',           width: 24 },
    { key: 'prevPct',   header: prevMonth ? `vs Prev FCST (${prevMonth.slice(0,3)}) %` : 'vs Prev %', width: 16 },
    { key: 'prevCmt',   header: 'vs Prev FCST 코멘트',   width: 24 },
  );
  ws.columns = cols;

  // ── 헤더 스타일 ──────────────────────────────────────────────────────────
  const hdrRow = ws.getRow(1);
  hdrRow.height = 24;
  hdrRow.eachCell(cell => {
    cell.font      = { bold: true, name: 'Arial', size: 9, color: { argb: 'FFFFFFFF' } };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border    = {
      bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      right:  { style: 'hair', color: { argb: 'FFD1D5DB' } },
    };
  });
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

  // ── 데이터 행 ─────────────────────────────────────────────────────────────
  const eur = (krw: number) => krw > 0 ? Math.round(krw / fxRate) : null;
  const FMT_EUR = '"€"#,##0;"(€"#,##0;"-"';
  const FMT_PCT = '+0.0%;-0.0%;"-"';

  let prevCustId = '';

  for (const cust of customers) {
    const custMemo = custMemoMap.get(cust.id) ?? '';
    const custBg   = TIER_BG[cust.tier] ?? 'FFFFFF';

    for (const prod of products) {
      const cid = cust.id, pid = prod.id;
      const q1k = fcstMap.get(`${cid}_${pid}_1`) ?? 0;
      const q2k = fcstMap.get(`${cid}_${pid}_2`) ?? 0;
      const q3k = fcstMap.get(`${cid}_${pid}_3`) ?? 0;
      const q4k = fcstMap.get(`${cid}_${pid}_4`) ?? 0;
      const fyk = q1k + q2k + q3k + q4k;

      const nq1 = noteMap.get(`${cid}_${pid}_1`) ?? '';
      const nq2 = noteMap.get(`${cid}_${pid}_2`) ?? '';
      const nq3 = noteMap.get(`${cid}_${pid}_3`) ?? '';
      const nq4 = noteMap.get(`${cid}_${pid}_4`) ?? '';
      const hasNote = nq1 || nq2 || nq3 || nq4;

      // 금액도 없고 메모도 없는 행 스킵
      if (fyk === 0 && !hasNote) continue;

      const py1 = actualMap.get(`${cid}_${pid}_1`) ?? 0;
      const py2 = actualMap.get(`${cid}_${pid}_2`) ?? 0;
      const py3 = actualMap.get(`${cid}_${pid}_3`) ?? 0;
      const py4 = actualMap.get(`${cid}_${pid}_4`) ?? 0;
      const pyk  = py1 + py2 + py3 + py4;

      const vsly    = fyk > 0 && pyk > 0 ? ((fyk - pyk) / pyk) : null;
      const prevFy  = prevFcstMap.get(`${cid}_${pid}`) ?? 0;
      const vsPrev  = fyk > 0 && prevFy > 0 ? ((fyk - prevFy) / prevFy) : null;
      const cmt     = commentMap.get(`${cid}_${pid}`);

      const rowData: Record<string, string | number | null> = {
        sbu:     `${prod.sbu_code}  ${prod.sbu_name}`,
        bf:      prod.bf_name,
        am:      cust.owner.name,
        q1:      eur(q1k),
        q2:      eur(q2k),
        q3:      eur(q3k),
        q4:      eur(q4k),
        fy:      eur(fyk),
        py:      eur(pyk),
        vsly:    vsly,
        lyCmt:   cmt?.ly_comment   ?? null,
        prevPct: vsPrev,
        prevCmt: cmt?.prev_comment ?? null,
      };
      if (showCustCol) {
        rowData.custName = cust.name;
        rowData.tier     = cust.tier;
      }

      const row = ws.addRow(rowData);
      row.height = 18;

      // ── 기본 셀 스타일 ────────────────────────────────────────────────────
      const rowBg = fyk === 0 ? 'FFFBEB' : custBg; // 메모 전용 행은 황색
      row.eachCell({ includeEmpty: false }, cell => {
        cell.font   = { name: 'Arial', size: 9 };
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + rowBg } };
        cell.border = {
          bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
          right:  { style: 'hair', color: { argb: 'FFE5E7EB' } },
        };
      });

      // 고객사 구분선 (전체 탭)
      if (showCustCol && cust.id !== prevCustId) {
        row.getCell('custName').border = {
          top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
          right:  { style: 'hair', color: { argb: 'FFE5E7EB' } },
        };
        row.getCell('custName').font = { name: 'Arial', size: 9, bold: true };
        prevCustId = cust.id;

        // 고객 탭 메모 → 고객사 셀에 Excel 코멘트
        if (custMemo) {
          (row.getCell('custName') as any).note = {
            texts: [
              { font: { name: 'Arial', size: 9, bold: true }, text: '고객 메모\n' },
              { font: { name: 'Arial', size: 9 }, text: custMemo },
            ],
          };
        }
      }

      // ── Q1~Q4: 메모 있는 셀 황색 + Excel 네이티브 코멘트 ─────────────────
      const qNotes: [string, string][] = [
        ['q1', nq1], ['q2', nq2], ['q3', nq3], ['q4', nq4],
      ];
      qNotes.forEach(([key, note]) => {
        const cell = row.getCell(key);
        cell.numFmt    = FMT_EUR;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        if (note) {
          // 황색 배경 (앱 UI와 동일)
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NOTE_BG } };
          // Excel 네이티브 코멘트
          (cell as any).note = {
            texts: [{ font: { name: 'Arial', size: 9 }, text: note }],
          };
        }
      });

      // 단일 고객 탭에서 첫 행에만 고객 탭 메모 코멘트 (SBU 첫 행)
      if (!showCustCol && custMemo && prod === products.find(p => {
        const f = (fcstMap.get(`${cust.id}_${p.id}_1`) ?? 0)
               + (fcstMap.get(`${cust.id}_${p.id}_2`) ?? 0)
               + (fcstMap.get(`${cust.id}_${p.id}_3`) ?? 0)
               + (fcstMap.get(`${cust.id}_${p.id}_4`) ?? 0);
        const n = noteMap.has(`${cust.id}_${p.id}_1`)
               || noteMap.has(`${cust.id}_${p.id}_2`)
               || noteMap.has(`${cust.id}_${p.id}_3`)
               || noteMap.has(`${cust.id}_${p.id}_4`);
        return f > 0 || n;
      })) {
        (row.getCell('sbu') as any).note = {
          texts: [
            { font: { name: 'Arial', size: 9, bold: true }, text: '고객 메모\n' },
            { font: { name: 'Arial', size: 9 }, text: custMemo },
          ],
        };
      }

      // 숫자 포맷
      ['q1','q2','q3','q4','fy','py'].forEach(k => {
        const cell = row.getCell(k);
        cell.numFmt    = FMT_EUR;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      const vslyCell = row.getCell('vsly');
      vslyCell.numFmt    = FMT_PCT;
      vslyCell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (vsly != null) {
        vslyCell.font = { name: 'Arial', size: 9, color: { argb: vsly >= 0 ? 'FF15803D' : 'FFDC2626' } };
      }
      const prevPctCell = row.getCell('prevPct');
      prevPctCell.numFmt    = FMT_PCT;
      prevPctCell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (vsPrev != null) {
        prevPctCell.font = { name: 'Arial', size: 9, color: { argb: vsPrev >= 0 ? 'FF15803D' : 'FFDC2626' } };
      }
    }
  }

  // ── 파일 반환 ─────────────────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer();
  const dateStr  = new Date().toISOString().slice(0, 10);
  const safeName = custName.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `FCST_${year}_${snapshotMonth}_${safeName}_${dateStr}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control':       'no-store',
    },
  });
}
