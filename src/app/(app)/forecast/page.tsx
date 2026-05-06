'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import type { ColDef, CellValueChangedEvent, GridReadyEvent, CellContextMenuEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import { Lock, Unlock, Download, RefreshCw, StickyNote, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── 셀 노트 모달 ────────────────────────────────────────────────────────────
interface NoteModalState {
  open: boolean;
  custId: string;
  prodId: string;
  quarter: number;
  custName: string;
  sbuName: string;
  text: string;
}
const NOTE_MODAL_CLOSED: NoteModalState = {
  open: false, custId: '', prodId: '', quarter: 0,
  custName: '', sbuName: '', text: '',
};

const SNAPSHOT_MONTHS = [
  { value: 'JANUARY',  label: 'Jan (1월)' },
  { value: 'FEBRUARY', label: 'Feb (2월)' },
  { value: 'APRIL',    label: 'Apr (4월)' },
  { value: 'JUNE',     label: 'Jun (6월)' },
  { value: 'AUGUST',   label: 'Aug (8월)' },
  { value: 'OCTOBER',  label: 'Oct (10월)' },
  { value: 'NOVEMBER', label: 'Nov (11월)' },
  { value: 'DECEMBER', label: 'Dec (12월)' },
];

const TIER_BG: Record<string, string> = { A: '#FEF3C7', B: '#EFF6FF', C: '#F8FAFC' };

interface Row {
  id: string;
  customer_id: string; customer_name: string; customer_tier: string;
  lifecycle: string; am_name: string;
  product_id: string; sbu_code: string; sbu_name: string;
  bf_code: string; bf_name: string; bu_code: string;
  q1_krw: number | null; q2_krw: number | null;
  q3_krw: number | null; q4_krw: number | null;
  fy_krw: number | null; fy_eur: number | null;
  py1: number | null; py2: number | null;
  py3: number | null; py4: number | null;
  py_fy: number | null; vs_ly_pct: number | null;
  ly_comment: string | null;
  prev_fy_krw: number | null; vs_prev_pct: number | null;
  prev_comment: string | null;
  prev_snapshot_month: string | null;
  compare_fy?: number | null;
}

interface Customer { id: string; name: string; tier: string }

// 전체 합산 탭: 75개 SBU별 합계 행
function buildAggRows(rows: Row[], fxRate: number): Row[] {
  const map = new Map<string, any>();
  rows.forEach(r => {
    if (!map.has(r.product_id)) {
      map.set(r.product_id, {
        id: `ALL_${r.product_id}`,
        customer_id: 'ALL', customer_name: '전체 합산', customer_tier: '',
        am_name: '', lifecycle: '',
        product_id: r.product_id,
        sbu_code: r.sbu_code, sbu_name: r.sbu_name,
        bf_code: r.bf_code, bf_name: r.bf_name, bu_code: r.bu_code,
        q1_krw: 0, q2_krw: 0, q3_krw: 0, q4_krw: 0, py_fy: 0,
      });
    }
    const a = map.get(r.product_id)!;
    a.q1_krw += r.q1_krw ?? 0;
    a.q2_krw += r.q2_krw ?? 0;
    a.q3_krw += r.q3_krw ?? 0;
    a.q4_krw += r.q4_krw ?? 0;
    a.py_fy  += r.py_fy  ?? 0;
  });

  return Array.from(map.values())
    .map(r => {
      const fy = r.q1_krw + r.q2_krw + r.q3_krw + r.q4_krw;
      return {
        ...r,
        q1_krw: r.q1_krw || null, q2_krw: r.q2_krw || null,
        q3_krw: r.q3_krw || null, q4_krw: r.q4_krw || null,
        fy_krw: fy || null,
        fy_eur: fy > 0 ? Math.round(fy / fxRate) : null,
        py_fy:  r.py_fy || null,
        vs_ly_pct: fy && r.py_fy ? ((fy - r.py_fy) / r.py_fy) * 100 : null,
      };
    })
    .sort((a: any, b: any) => {
      if (a.bu_code !== b.bu_code) return a.bu_code.localeCompare(b.bu_code);
      if (a.bf_code !== b.bf_code) return a.bf_code.localeCompare(b.bf_code);
      return a.sbu_code.localeCompare(b.sbu_code);
    });
}

export default function ForecastPage() {
  const gridRef = useRef<AgGridReact>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(2025);
  const [snapshotMonth, setSnapshotMonth] = useState('NOVEMBER');
  const [compareMonth, setCompareMonth] = useState('');
  const [compareMap, setCompareMap] = useState<Map<string, number | null>>(new Map());
  const [fxRate, setFxRate] = useState(1409);
  const [saving, setSaving] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>('VIEWER');
  const [locking, setLocking] = useState(false);
  const [selectedCustId, setSelectedCustId] = useState<string>('ALL');

  // ── 고객 탭 메모 상태 ────────────────────────────────────────────────────
  const [memoMap, setMemoMap]       = useState<Record<string, string>>({});
  const [memoText, setMemoText]     = useState('');
  const [memoOpen, setMemoOpen]     = useState(false);
  const [memoSaving, setMemoSaving] = useState(false);

  // ── 셀 노트 상태 ────────────────────────────────────────────────────────
  // key: "custId_prodId_quarter"  value: 노트 텍스트
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [noteModal, setNoteModal] = useState<NoteModalState>(NOTE_MODAL_CLOSED);
  const [noteSaving, setNoteSaving] = useState(false);

  // ── 데이터 로드 ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [gridRes, memoRes, cellNoteRes] = await Promise.all([
      fetch(`/api/forecast/grid-data?year=${year}&snapshotMonth=${snapshotMonth}`),
      fetch(`/api/forecast/memo?year=${year}&snapshotMonth=${snapshotMonth}`),
      fetch(`/api/forecast/cell-note?year=${year}&snapshotMonth=${snapshotMonth}`),
    ]);
    const data         = await gridRes.json();
    const memoData     = await memoRes.json();
    const cellNoteData = await cellNoteRes.json();
    setRows(data.rows ?? []);
    setFxRate(data.fxRate ?? 1409);
    setIsLocked(data.isLocked ?? false);
    setIsAdmin(data.isAdmin ?? false);
    setUserRole(data.userRole ?? 'VIEWER');
    setMemoMap(memoData.memos ?? {});
    setNoteMap(cellNoteData.notes ?? {});
    setLoading(false);
  }, [year, snapshotMonth]);

  useEffect(() => { load(); }, [load]);

  // 비교 스냅샷 로드
  useEffect(() => {
    if (!compareMonth) { setCompareMap(new Map()); return; }
    fetch(`/api/forecast/grid-data?year=${year}&snapshotMonth=${compareMonth}`)
      .then(r => r.json())
      .then((data) => {
        const m = new Map<string, number | null>();
        (data.rows ?? []).forEach((r: Row) => m.set(`${r.customer_id}_${r.product_id}`, r.fy_krw));
        setCompareMap(m);
      });
  }, [compareMonth, year]);

  // ── 고객 목록 추출 ───────────────────────────────────────────────────────
  const customers = useMemo<Customer[]>(() => {
    const seen = new Map<string, Customer>();
    rows.forEach(r => {
      if (!seen.has(r.customer_id))
        seen.set(r.customer_id, { id: r.customer_id, name: r.customer_name, tier: r.customer_tier });
    });
    return Array.from(seen.values()).sort((a, b) =>
      a.tier !== b.tier ? a.tier.localeCompare(b.tier) : a.name.localeCompare(b.name)
    );
  }, [rows]);

  const tierGroups = useMemo(() => {
    const g: Record<string, Customer[]> = { A: [], B: [], C: [] };
    customers.forEach(c => (g[c.tier] ??= []).push(c));
    return g;
  }, [customers]);

  // ── 고객 탭 변경 시 메모 동기화 ──────────────────────────────────────────
  useEffect(() => {
    if (selectedCustId === 'ALL') { setMemoOpen(false); return; }
    setMemoText(memoMap[selectedCustId] ?? '');
    // 메모 있으면 자동으로 열기
    setMemoOpen(!!(memoMap[selectedCustId]));
  }, [selectedCustId, memoMap]);

  // ── 메모 저장 (blur 시) ───────────────────────────────────────────────────
  const saveMemo = useCallback(async () => {
    if (selectedCustId === 'ALL') return;
    const prev = memoMap[selectedCustId] ?? '';
    if (memoText === prev) return;           // 변경 없으면 스킵
    setMemoSaving(true);
    await fetch('/api/forecast/memo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id:    selectedCustId,
        year,
        snapshot_month: snapshotMonth,
        memo:           memoText,
      }),
    });
    setMemoMap(prev => ({ ...prev, [selectedCustId]: memoText }));
    setMemoSaving(false);
  }, [selectedCustId, memoText, memoMap, year, snapshotMonth]);

  // ── 셀 노트 열기 ─────────────────────────────────────────────────────────
  const openNoteModal = useCallback((row: Row, quarter: number) => {
    const key = `${row.customer_id}_${row.product_id}_${quarter}`;
    setNoteModal({
      open: true,
      custId: row.customer_id,
      prodId: row.product_id,
      quarter,
      custName: row.customer_name,
      sbuName: `${row.sbu_code} ${row.sbu_name}`,
      text: noteMap[key] ?? '',
    });
  }, [noteMap]);

  // ── 셀 노트 저장 ─────────────────────────────────────────────────────────
  const saveNote = useCallback(async () => {
    if (!noteModal.open) return;
    setNoteSaving(true);
    const key = `${noteModal.custId}_${noteModal.prodId}_${noteModal.quarter}`;
    await fetch('/api/forecast/cell-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id:    noteModal.custId,
        product_id:     noteModal.prodId,
        year,
        quarter:        noteModal.quarter,
        snapshot_month: snapshotMonth,
        note:           noteModal.text,
      }),
    });
    // 로컬 맵 업데이트 (빈 문자열이면 키 삭제)
    setNoteMap(prev => {
      const next = { ...prev };
      if (noteModal.text.trim()) next[key] = noteModal.text;
      else delete next[key];
      return next;
    });
    setNoteSaving(false);
    setNoteModal(NOTE_MODAL_CLOSED);
  }, [noteModal, year, snapshotMonth]);

  // ── 탭별 그리드 데이터 ────────────────────────────────────────────────────
  const gridRows = useMemo<Row[]>(() => {
    const base = selectedCustId === 'ALL'
      ? buildAggRows(rows, fxRate)
      : rows.filter(r => r.customer_id === selectedCustId);

    if (!compareMonth) return base;
    return base.map(r => ({
      ...r,
      compare_fy: compareMap.get(`${r.customer_id}_${r.product_id}`) ?? null,
    }));
  }, [rows, selectedCustId, fxRate, compareMonth, compareMap]);

  // ── 셀 노트가 있는 고객 ID 집합 (탭 표시용) ──────────────────────────────
  const custsWithNotes = useMemo(() => {
    const s = new Set<string>();
    Object.keys(noteMap).forEach(key => {
      // key = "custId_prodId_quarter"  custId is a cuid (no underscores)
      const firstUnderscore = key.indexOf('_');
      if (firstUnderscore > 0) s.add(key.substring(0, firstUnderscore));
    });
    return s;
  }, [noteMap]);

  // ── 합계 계산 ────────────────────────────────────────────────────────────
  const fyKrw  = gridRows.reduce((s, r) => s + (r.fy_krw ?? 0), 0);
  const fyEur  = fxRate > 0 ? Math.round(fyKrw / fxRate) : 0;
  const pyKrw  = gridRows.reduce((s, r) => s + (r.py_fy  ?? 0), 0);
  const vsLyPct = fyKrw && pyKrw ? ((fyKrw - pyKrw) / pyKrw) * 100 : null;

  // ── 셀 저장 ──────────────────────────────────────────────────────────────
  const onCellValueChanged = useCallback(async (e: CellValueChangedEvent) => {
    if (isLocked && !isAdmin) return;
    const row: Row = e.data;
    const field = e.colDef.field as string;

    // 코멘트 필드 저장
    if (field === 'ly_comment' || field === 'prev_comment') {
      setSaving(true);
      await fetch('/api/forecast/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: row.customer_id,
          product_id: row.product_id,
          year,
          snapshot_month: snapshotMonth,
          [field]: e.newValue ?? null,
        }),
      });
      setSaving(false);
      e.api.applyTransaction({ update: [{ ...row, [field]: e.newValue ?? null }] });
      return;
    }

    // Q1~Q4 금액 저장
    const quarterMap: Record<string, number> = { q1_krw: 1, q2_krw: 2, q3_krw: 3, q4_krw: 4 };
    const quarter = quarterMap[field];
    if (!quarter) return;

    const amount_krw = parseFloat(String(e.newValue).replace(/,/g, '')) || 0;
    setSaving(true);
    await fetch('/api/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: row.customer_id, product_id: row.product_id, year, quarter, snapshot_month: snapshotMonth, amount_krw }),
    });
    setSaving(false);

    const updated: any = { ...row, [field]: amount_krw };
    const fy = (updated.q1_krw ?? 0) + (updated.q2_krw ?? 0) + (updated.q3_krw ?? 0) + (updated.q4_krw ?? 0);
    updated.fy_krw = fy || null;
    updated.fy_eur = fy > 0 ? Math.round(fy / fxRate) : null;
    if (updated.py_fy) updated.vs_ly_pct = fy ? ((fy - updated.py_fy) / updated.py_fy) * 100 : null;
    if (updated.prev_fy_krw) updated.vs_prev_pct = fy ? ((fy - updated.prev_fy_krw) / updated.prev_fy_krw) * 100 : null;
    e.api.applyTransaction({ update: [updated] });
  }, [year, snapshotMonth, fxRate, isLocked, isAdmin]);

  // ── 잠금/해제 ────────────────────────────────────────────────────────────
  const handleLock = async () => {
    if (!isAdmin) return;
    setLocking(true);
    const action = isLocked ? 'unlock' : 'lock';
    const res = await fetch('/api/forecast/lock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, snapshotMonth, action }),
    });
    if (res.ok) {
      setIsLocked(!isLocked);
      await load();
    }
    setLocking(false);
  };

  // ── 컬럼 정의 ────────────────────────────────────────────────────────────
  const canEdit  = userRole === 'ADMIN' || userRole === 'EDITOR';
  const editable = canEdit && (!isLocked || isAdmin) && selectedCustId !== 'ALL';

  const colDefs = useMemo((): ColDef[] => {
    // NOTE_SVG: 우상단 황색 삼각형 (엑셀 셀 코멘트와 동일한 표현)
    const NOTE_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Cpolygon points='8,0 8,8 0,0' fill='%23F59E0B'/%3E%3C/svg%3E")`;

    const qCol = (q: number): ColDef => ({
      headerName: `Q${q} (€)`,
      field: `q${q}_krw`,
      width: 112,
      editable,
      type: 'numericColumn',
      headerTooltip: 'KRW 입력 → EUR 자동 표시 | 우클릭으로 셀 메모',
      valueFormatter: (p) => p.value ? `€${Math.round(p.value / fxRate).toLocaleString('ko-KR')}` : '',
      valueParser:    (p) => parseFloat(String(p.newValue).replace(/,/g, '')) || 0,
      tooltipValueGetter: (p) => {
        if (!p.data) return '';
        const key = `${p.data.customer_id}_${p.data.product_id}_${q}`;
        return noteMap[key] ?? '';
      },
      cellStyle: (p) => {
        const hasNote = !!p.data && !!noteMap[`${p.data.customer_id}_${p.data.product_id}_${q}`];
        return {
          backgroundColor: p.value ? '#FEFCE8' : '#fff',
          textAlign:        'right' as const,
          color:            '#1e293b',
          backgroundImage:  hasNote ? NOTE_SVG : 'none',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'top right',
          backgroundSize:   '8px 8px',
        };
      },
    });

    const cols: ColDef[] = [];

    // 전체 탭에서만 고객사 컬럼 표시
    if (selectedCustId === 'ALL') {
      cols.push({
        headerName: '고객사', field: 'customer_name',
        pinned: 'left', width: 145, editable: false,
        cellStyle: (p) => ({ backgroundColor: TIER_BG[p.data?.customer_tier] ?? '#fff', fontWeight: 600 }),
        cellRenderer: (p: { data: Row }) => p.data ? (
          <span className="flex items-center gap-1.5">
            <span className={cn('text-xs px-1.5 rounded font-bold',
              p.data.customer_tier === 'A' ? 'bg-amber-200 text-amber-800' :
              p.data.customer_tier === 'B' ? 'bg-blue-200 text-blue-800' : 'bg-slate-200 text-slate-600')}>
              {p.data.customer_tier}
            </span>
            {p.data.customer_name}
          </span>
        ) : null,
      });
    }

    cols.push(
      {
        headerName: 'SBU', field: 'sbu_name',
        pinned: 'left', width: 215, editable: false,
        valueGetter: (p) => p.data ? `${p.data.sbu_code}  ${p.data.sbu_name}` : '',
        cellStyle: { color: '#334155', fontSize: 12 },
      },
      { headerName: 'BF', field: 'bf_name', width: 145, editable: false, cellStyle: { color: '#94a3b8', fontSize: 11 } },
    );

    if (selectedCustId !== 'ALL') {
      cols.push({ headerName: 'AM', field: 'am_name', width: 85, editable: false, cellStyle: { color: '#94a3b8', fontSize: 11 } });
    }

    cols.push(qCol(1), qCol(2), qCol(3), qCol(4));

    cols.push(
      {
        headerName: 'FY (€)', field: 'fy_krw', width: 128, editable: false,
        valueFormatter: (p) => p.value ? `€${Math.round(p.value / fxRate).toLocaleString('ko-KR')}` : '',
        cellStyle: { backgroundColor: '#EFF6FF', color: '#1D4ED8', fontWeight: 700, textAlign: 'right' },
      },
      {
        headerName: `PY (${year - 1})`, field: 'py_fy', width: 115, editable: false,
        valueFormatter: (p) => p.value ? `€${Math.round(p.value / fxRate).toLocaleString('ko-KR')}` : '',
        cellStyle: { color: '#94a3b8', textAlign: 'right', fontSize: 11 },
      },
      {
        headerName: 'vs LY %', field: 'vs_ly_pct', width: 90, editable: false,
        valueFormatter: (p) => p.value != null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%` : '',
        cellStyle: (p) => ({
          color: p.value > 0 ? '#16a34a' : p.value < 0 ? '#dc2626' : '#94a3b8',
          fontWeight: 600, textAlign: 'right',
        }),
      },
      {
        headerName: 'vs LY 코멘트', field: 'ly_comment', width: 180,
        editable: editable,
        cellStyle: { color: '#475569', fontSize: 11, backgroundColor: '#f8fafc' },
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
        cellEditorParams: { maxLength: 300, rows: 3 },
        valueFormatter: (p) => p.value ?? '',
      },
      {
        headerName: (rows[0]?.prev_snapshot_month
          ? `vs Prev FCST (${rows[0].prev_snapshot_month.slice(0,3)}) %`
          : 'vs Prev FCST %'),
        field: 'vs_prev_pct', width: 130, editable: false,
        valueFormatter: (p) => p.value != null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}%` : '—',
        cellStyle: (p) => ({
          color: p.value > 0 ? '#16a34a' : p.value < 0 ? '#dc2626' : '#94a3b8',
          fontWeight: 600, textAlign: 'right', backgroundColor: '#fafaf5',
        }),
      },
      {
        headerName: 'vs Prev FCST 코멘트', field: 'prev_comment', width: 180,
        editable: editable,
        cellStyle: { color: '#475569', fontSize: 11, backgroundColor: '#fafaf5' },
        cellEditor: 'agLargeTextCellEditor',
        cellEditorPopup: true,
        cellEditorParams: { maxLength: 300, rows: 3 },
        valueFormatter: (p) => p.value ?? '',
      },
    );

    // 비교 스냅샷 컬럼
    if (compareMonth) {
      const cLabel = SNAPSHOT_MONTHS.find(m => m.value === compareMonth)?.label ?? compareMonth;
      cols.push(
        {
          headerName: `${cLabel} FY`,
          field: 'compare_fy', width: 115, editable: false,
          valueFormatter: (p) => p.value ? `€${Math.round(p.value / fxRate).toLocaleString('ko-KR')}` : '',
          cellStyle: { color: '#7c3aed', textAlign: 'right', fontSize: 11, backgroundColor: '#faf5ff' },
        },
        {
          headerName: 'Δ vs prev',
          width: 105, editable: false,
          valueGetter: (p) => (p.data?.fy_krw ?? 0) - (p.data?.compare_fy ?? 0),
          valueFormatter: (p) => {
            if (!p.value) return '';
            const sign = p.value > 0 ? '+' : '';
            return `${sign}€${Math.round(Math.abs(p.value) / fxRate).toLocaleString('ko-KR')}${p.value < 0 ? ' ▼' : ' ▲'}`;
          },
          cellStyle: (p) => ({
            color: p.value > 0 ? '#16a34a' : p.value < 0 ? '#dc2626' : '#94a3b8',
            fontWeight: 600, textAlign: 'right', fontSize: 11,
          }),
        },
      );
    }

    return cols;
  }, [fxRate, year, selectedCustId, editable, compareMonth, noteMap]);

  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    const custName = selectedCustId === 'ALL'
      ? 'ALL'
      : customers.find(c => c.id === selectedCustId)?.name ?? '';

    setExporting(true);
    try {
      const custParam = selectedCustId !== 'ALL' ? `&customerId=${selectedCustId}` : '';
      const res = await fetch(
        `/api/forecast/export-grid?year=${year}&snapshotMonth=${snapshotMonth}${custParam}`
      );
      if (!res.ok) { alert('Excel 생성 실패'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `FCST_${year}_${snapshotMonth}_${custName}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────────────
  return (
    <main className="flex flex-col h-screen bg-slate-50">

      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b flex-shrink-0 shadow-sm">
        <div>
          <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            FCST 입력
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded text-xs font-semibold">
                <Lock size={10} /> 잠금됨
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            KRW 입력 → EUR 자동 표시 &nbsp;|&nbsp; OP FX: 1 EUR = {fxRate.toLocaleString()} KRW
            {!canEdit && (
              <span className="ml-2 text-amber-600 font-medium">(조회 전용 — 편집 권한 없음)</span>
            )}
            {canEdit && !editable && selectedCustId !== 'ALL' && isLocked && !isAdmin && (
              <span className="ml-2 text-red-500 font-medium">(잠금 — 읽기 전용)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {saving && <span className="text-xs text-blue-600 animate-pulse">저장 중...</span>}

          {/* 이전 스냅샷 비교 */}
          <Sel
            value={compareMonth}
            onChange={setCompareMonth}
            className="border-purple-200 bg-purple-50 text-purple-700 text-xs"
          >
            <option value="">비교 없음</option>
            {SNAPSHOT_MONTHS.filter(m => m.value !== snapshotMonth).map(m => (
              <option key={m.value} value={m.value}>vs {m.label}</option>
            ))}
          </Sel>

          <Sel
            value={String(year)}
            onChange={v => { setYear(Number(v)); }}
            className="text-sm"
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </Sel>

          <Sel
            value={snapshotMonth}
            onChange={v => { setSnapshotMonth(v); }}
            className="text-sm"
          >
            {SNAPSHOT_MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </Sel>

          {/* 잠금 버튼 — ADMIN 전용 */}
          {isAdmin && (
            <button
              onClick={handleLock}
              disabled={locking}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                isLocked
                  ? 'bg-red-50 border-red-300 text-red-700 hover:bg-red-100'
                  : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
              )}
            >
              {isLocked ? <Unlock size={12} /> : <Lock size={12} />}
              {locking ? '처리 중...' : isLocked ? '잠금 해제' : '스냅샷 잠금'}
            </button>
          )}

          <button onClick={load} className="p-1.5 border border-slate-300 rounded-lg hover:bg-slate-50" title="새로고침">
            <RefreshCw size={14} className="text-slate-500" />
          </button>
          {userRole === 'ADMIN' && (
            <button
              onClick={exportExcel}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-400 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-medium hover:bg-emerald-100 disabled:opacity-50"
            >
              <Download size={13} /> {exporting ? '생성 중...' : 'Excel'}
            </button>
          )}
        </div>
      </div>

      {/* ── 합계 바 ── */}
      <div className="flex items-center gap-3 px-5 py-2 bg-white border-b flex-shrink-0">
        <div className="flex items-center gap-5 bg-slate-50 rounded-lg px-4 py-2 border text-sm">
          <Stat label={`FY ${year} KRW`} value={`${Math.round(fyKrw / 1_000_000).toLocaleString()} 백만`} />
          <Divider />
          <Stat label={`FY ${year} EUR`} value={`€${Math.round(fyEur / 1000).toLocaleString()}K`} color="text-blue-700" />
          <Divider />
          <Stat label={`PY (${year - 1})`} value={`€${Math.round(pyKrw / fxRate / 1000).toLocaleString()}K`} color="text-slate-400" />
          <Divider />
          <Stat
            label="vs LY"
            value={vsLyPct != null ? `${vsLyPct > 0 ? '+' : ''}${vsLyPct.toFixed(1)}%` : '—'}
            color={vsLyPct == null ? 'text-slate-400' : vsLyPct > 0 ? 'text-green-600' : 'text-red-600'}
          />
          <Divider />
          <Stat label="행 수" value={gridRows.length.toLocaleString()} />
        </div>

        {/* 현재 탭 안내 */}
        {selectedCustId !== 'ALL' && (
          <div className={cn(
            'text-xs px-3 py-1.5 rounded-lg border font-medium',
            editable ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'
          )}>
            {editable ? '✏️  셀 클릭 후 KRW 입력' : '🔒  읽기 전용'}
          </div>
        )}
        {selectedCustId === 'ALL' && (
          <div className="text-xs px-3 py-1.5 rounded-lg border bg-slate-50 text-slate-500">
            📊 전체 합산 — SBU별 집계 (편집 불가)
          </div>
        )}
      </div>

      {/* ── 바디: 사이드바 + 그리드 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 고객사 사이드바 */}
        <aside className="w-44 flex-shrink-0 border-r bg-white overflow-y-auto">

          {/* 전체 합산 탭 */}
          <button
            onClick={() => setSelectedCustId('ALL')}
            className={cn(
              'w-full text-left px-3 py-3 text-sm font-bold border-b transition-colors',
              selectedCustId === 'ALL'
                ? 'bg-blue-600 text-white'
                : 'text-slate-700 hover:bg-blue-50'
            )}
          >
            📊 전체 합산
          </button>

          {/* Tier별 고객 목록 */}
          {(['A', 'B', 'C'] as const).map(tier => (
            tierGroups[tier]?.length > 0 && (
              <div key={tier}>
                <div className={cn(
                  'px-3 py-1.5 text-xs font-bold tracking-widest border-b sticky top-0',
                  tier === 'A' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                  tier === 'B' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                 'bg-slate-50 text-slate-500 border-slate-100'
                )}>
                  TIER {tier}
                </div>
                {tierGroups[tier].map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustId(c.id)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 text-xs border-b transition-colors leading-tight flex items-center justify-between gap-1',
                      selectedCustId === c.id
                        ? 'bg-blue-50 text-blue-700 font-semibold border-l-2 border-l-blue-500'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <span className="truncate">{c.name}</span>
                    {custsWithNotes.has(c.id) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="셀 메모 있음" />
                    )}
                  </button>
                ))}
              </div>
            )
          ))}
        </aside>

        {/* 메모 + AG Grid를 세로로 묶기 */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* ── 메모 패널 (고객 탭 선택 시에만) ── */}
          {selectedCustId !== 'ALL' && (
            <div className="flex-shrink-0">
              {/* 메모 토글 버튼 */}
              <button
                onClick={() => setMemoOpen(o => !o)}
                className={cn(
                  'w-full flex items-center gap-2 px-4 py-2 text-xs font-medium border-b transition-colors',
                  memoOpen
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-white text-slate-400 hover:text-amber-600 hover:bg-amber-50 border-slate-100'
                )}
              >
                <StickyNote size={13} />
                <span className="font-semibold">메모</span>
                {memoMap[selectedCustId] && !memoOpen && (
                  <span className="truncate text-amber-600 italic ml-1">
                    {memoMap[selectedCustId].slice(0, 80)}{memoMap[selectedCustId].length > 80 ? '…' : ''}
                  </span>
                )}
                {memoSaving
                  ? <span className="ml-auto text-blue-500 animate-pulse">저장 중...</span>
                  : memoMap[selectedCustId]
                    ? <span className="ml-auto text-amber-400 text-xs">📝 저장됨</span>
                    : null
                }
              </button>

              {/* 메모 입력 영역 */}
              {memoOpen && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5">
                  <textarea
                    value={memoText}
                    onChange={e => setMemoText(e.target.value)}
                    onBlur={saveMemo}
                    placeholder="이 고객사에 대한 메모를 자유롭게 입력하세요. 포커스를 벗어나면 자동 저장됩니다."
                    rows={3}
                    className="w-full text-xs text-slate-700 bg-white border border-amber-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-300 placeholder:text-slate-300"
                  />
                </div>
              )}
            </div>
          )}

          {/* AG Grid */}
          <div className="ag-theme-quartz flex-1 overflow-hidden">
            <AgGridReact
              ref={gridRef}
              rowData={gridRows}
              columnDefs={colDefs}
              defaultColDef={{ resizable: true, sortable: true, filter: true }}
              onCellValueChanged={onCellValueChanged}
              onGridReady={(e: GridReadyEvent) => e.api.sizeColumnsToFit()}
              onCellContextMenu={(e: CellContextMenuEvent) => {
                const qFields = ['q1_krw','q2_krw','q3_krw','q4_krw'];
                const field   = e.colDef.field ?? '';
                if (!qFields.includes(field) || !e.data) return;
                e.event?.preventDefault();
                const q = parseInt(field[1]);   // 'q1_krw' → 1
                openNoteModal(e.data as Row, q);
              }}
              loading={loading}
              singleClickEdit={true}
              enableCellChangeFlash={true}
              stopEditingWhenCellsLoseFocus={true}
              undoRedoCellEditing={true}
              undoRedoCellEditingLimit={20}
              rowHeight={38}
              headerHeight={42}
            />
          </div>

        </div>{/* end: 메모+그리드 wrapper */}
      </div>

      {/* ── 셀 노트 모달 ── */}
      {noteModal.open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-xs text-slate-400 font-medium">셀 메모</p>
                <p className="font-semibold text-slate-800 text-sm mt-0.5">{noteModal.custName}</p>
                <p className="text-xs text-slate-500">{noteModal.sbuName} · Q{noteModal.quarter}</p>
              </div>
              <button onClick={() => setNoteModal(NOTE_MODAL_CLOSED)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded">
                <X size={16} />
              </button>
            </div>
            <textarea
              autoFocus
              value={noteModal.text}
              onChange={e => setNoteModal(p => ({ ...p, text: e.target.value }))}
              placeholder="메모를 입력하세요..."
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-slate-300"
            />
            <div className="flex gap-2 mt-3">
              {noteMap[`${noteModal.custId}_${noteModal.prodId}_${noteModal.quarter}`] && (
                <button
                  onClick={() => setNoteModal(p => ({ ...p, text: '' }))}
                  className="px-3 py-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
                >
                  삭제
                </button>
              )}
              <button onClick={() => setNoteModal(NOTE_MODAL_CLOSED)}
                className="flex-1 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                취소
              </button>
              <button onClick={saveNote} disabled={noteSaving}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50">
                {noteSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

function Stat({ label, value, color = 'text-slate-900' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 leading-none mb-0.5">{label}</p>
      <p className={cn('font-bold text-sm leading-none', color)}>{value}</p>
    </div>
  );
}
function Divider() {
  return <div className="h-7 w-px bg-slate-200" />;
}

// 브라우저 기본 화살표를 완전히 제거한 커스텀 Select
const ARROW_SVG = `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`;

function Sel({
  value, onChange, children, className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'pl-3 pr-7 py-1.5 border border-slate-300 rounded-lg',
        'text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-blue-400',
        'cursor-pointer',
        className,
      )}
      style={{
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        backgroundColor: 'white',
        backgroundImage: ARROW_SVG,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '14px',
      }}
    >
      {children}
    </select>
  );
}
