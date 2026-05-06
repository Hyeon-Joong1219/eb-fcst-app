'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, X, ExternalLink } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ROType = 'RISK' | 'OPPORTUNITY';
type ROLevel = 'H' | 'M' | 'L';

interface ROItem {
  id: string;
  customer_id: string;
  product_id: string | null;
  bf_code: string | null;
  year: number;
  quarter: number | null;
  type: ROType;
  level: ROLevel;
  weight: number;
  raw_amount: number;
  weighted_amount_krw: number;
  comment: string;
  sfdc_link: string | null;
  customer: { id: string; name: string };
  product: { id: string; sbu_code: string; sbu_name: string; bf_code: string | null } | null;
  creator: { id: string; name: string };
}

interface Customer {
  id: string;
  name: string;
  owner_id: string;
}

interface Product {
  id: string;
  sbu_code: string;
  sbu_name: string;
  bf_code: string | null;
  bf_name: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const YEARS = [2023, 2024, 2025, 2026, 2027];
const WEIGHT: Record<ROLevel, number> = { H: 0.75, M: 0.50, L: 0.25 };

const TYPE_LABEL: Record<ROType, string> = {
  RISK: 'RISK',
  OPPORTUNITY: 'OPP',
};

const TYPE_COLOR: Record<ROType, string> = {
  RISK: 'bg-red-100 text-red-700',
  OPPORTUNITY: 'bg-green-100 text-green-700',
};

const LEVEL_COLOR: Record<ROLevel, string> = {
  H: 'text-red-600 font-bold',
  M: 'text-amber-500 font-bold',
  L: 'text-slate-500 font-bold',
};

const inputCls =
  'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtEur(eur: number): string {
  if (Math.abs(eur) >= 1_000_000) {
    return `€${(eur / 1_000_000).toFixed(1)}M`;
  }
  return `€${Math.round(eur / 1_000).toLocaleString()}K`;
}

function fmtKrwEok(krw: number): string {
  const eok = krw / 100_000_000;
  if (Math.abs(eok) >= 1) return `${eok.toFixed(1)}억`;
  return `${(krw / 10_000).toFixed(0)}만`;
}

function quarterLabel(q: number | null): string {
  if (!q) return '연간';
  return `Q${q}`;
}

// ─── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl border px-5 py-4 flex-1 min-w-0">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold truncate ${color ?? 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ROPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null); // null = 전체
  const [items, setItems] = useState<ROItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [fcstKrw, setFcstKrw] = useState(0);
  const [fxRate, setFxRate] = useState(1400);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<ROItem | null>(null);

  // Load R&O data
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ year: String(year) });
    if (selectedCustomerId) params.set('customerId', selectedCustomerId);

    const [roData, custData] = await Promise.all([
      fetch(`/api/ro?${params}`).then(r => r.json()),
      fetch('/api/customers').then(r => r.ok ? r.json() : []),
    ]);

    setItems(roData.items ?? []);
    setFcstKrw(roData.fcstKrw ?? 0);
    setFxRate(roData.fxRate ?? 1400);
    setCustomers(custData);
    setLoading(false);
  }, [year, selectedCustomerId]);

  useEffect(() => { load(); }, [load]);

  // Derived KPIs
  const displayedItems = selectedCustomerId
    ? items.filter(i => i.customer_id === selectedCustomerId)
    : items;

  const riskKrw = displayedItems
    .filter(i => i.type === 'RISK')
    .reduce((s, i) => s + Number(i.weighted_amount_krw), 0);

  const oppKrw = displayedItems
    .filter(i => i.type === 'OPPORTUNITY')
    .reduce((s, i) => s + Number(i.weighted_amount_krw), 0);

  const netKrw = fcstKrw + oppKrw - riskKrw;
  const toEur = (krw: number) => fxRate > 0 ? krw / fxRate : 0;

  // Unique customers from items + loaded customers list (for sidebar)
  const itemCustomerIds = new Set(items.map(i => i.customer_id));
  const sidebarCustomers = customers.filter(c => itemCustomerIds.has(c.id));

  function openAdd() {
    setEditTarget(null);
    setShowModal(true);
  }

  function openEdit(item: ROItem) {
    setEditTarget(item);
    setShowModal(true);
  }

  async function handleDelete(item: ROItem) {
    if (!confirm(`"${item.comment.slice(0, 30)}..." 항목을 삭제하시겠습니까?`)) return;
    const res = await fetch(`/api/ro/${item.id}`, { method: 'DELETE' });
    if (res.ok) {
      load();
    } else {
      const err = await res.json();
      alert(err.error ?? '삭제 실패');
    }
  }

  return (
    <main className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* ── Left sidebar: customer tabs ── */}
      <aside className="w-48 flex-shrink-0 bg-slate-50 border-r flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b">
          <label className="block text-xs font-medium text-slate-500 mb-1">연도</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 6px center',
              backgroundSize: '14px',
              paddingRight: '28px',
            }}
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {/* 전체 합산 tab */}
          <button
            onClick={() => setSelectedCustomerId(null)}
            className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
              selectedCustomerId === null
                ? 'bg-blue-600 text-white font-semibold'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            전체 합산
          </button>

          {sidebarCustomers.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCustomerId(c.id)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors truncate ${
                selectedCustomerId === c.id
                  ? 'bg-blue-600 text-white font-semibold'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Right content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <div>
            <h1 className="text-xl font-bold text-slate-900">R&O 관리</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {selectedCustomerId
                ? customers.find(c => c.id === selectedCustomerId)?.name ?? ''
                : '전체 고객'} · {year}년
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} /> R&O 추가
          </button>
        </div>

        {/* KPI bar */}
        <div className="flex gap-3 px-6 py-4 bg-slate-50 border-b">
          <KpiCard
            label="FCST (FY)"
            value={fmtEur(toEur(fcstKrw))}
            sub={`KRW ${fmtKrwEok(fcstKrw)}`}
            color="text-slate-900"
          />
          <KpiCard
            label="Risk (가중)"
            value={`-${fmtEur(toEur(riskKrw))}`}
            sub={`KRW -${fmtKrwEok(riskKrw)}`}
            color="text-red-600"
          />
          <KpiCard
            label="Opportunity (가중)"
            value={`+${fmtEur(toEur(oppKrw))}`}
            sub={`KRW +${fmtKrwEok(oppKrw)}`}
            color="text-green-600"
          />
          <KpiCard
            label="Net (FCST ± R&O)"
            value={fmtEur(toEur(netKrw))}
            sub={`KRW ${fmtKrwEok(netKrw)}`}
            color={netKrw >= 0 ? 'text-blue-700' : 'text-red-700'}
          />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="text-center py-16 text-slate-400">불러오는 중...</div>
          ) : displayedItems.length === 0 ? (
            <div className="text-center py-16 text-slate-400">R&O 항목이 없습니다</div>
          ) : (
            <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs">구분</th>
                    {!selectedCustomerId && (
                      <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs">고객사</th>
                    )}
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs">SBU / 제품</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs">분기</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-slate-700 text-xs">원금 (KRW)</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-700 text-xs">Level</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-slate-700 text-xs">가중%</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-slate-700 text-xs">가중 금액 (EUR)</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-slate-700 text-xs">Comment</th>
                    <th className="px-3 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedItems.map(item => {
                    const weightedEur = toEur(Number(item.weighted_amount_krw));
                    const isRisk = item.type === 'RISK';
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        {/* Type badge */}
                        <td className="px-3 py-2.5">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${TYPE_COLOR[item.type]}`}>
                            {TYPE_LABEL[item.type]}
                          </span>
                        </td>

                        {/* Customer (전체 view only) */}
                        {!selectedCustomerId && (
                          <td className="px-3 py-2.5 text-slate-700 font-medium text-xs max-w-[120px] truncate">
                            {item.customer.name}
                          </td>
                        )}

                        {/* SBU / Product */}
                        <td className="px-3 py-2.5 text-slate-500 text-xs">
                          {item.product
                            ? `${item.product.sbu_code} · ${item.product.sbu_name}`
                            : item.bf_code
                              ? item.bf_code
                              : '—'}
                        </td>

                        {/* Quarter */}
                        <td className="px-3 py-2.5 text-slate-600 text-xs">
                          {quarterLabel(item.quarter)}
                        </td>

                        {/* Raw amount KRW */}
                        <td className="px-3 py-2.5 text-right text-slate-700 tabular-nums text-xs">
                          {fmtKrwEok(Number(item.raw_amount))}
                        </td>

                        {/* Level badge */}
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-xs ${LEVEL_COLOR[item.level]}`}>{item.level}</span>
                        </td>

                        {/* Weight % */}
                        <td className="px-3 py-2.5 text-center text-xs text-slate-500">
                          {Math.round(Number(item.weight) * 100)}%
                        </td>

                        {/* Weighted amount EUR */}
                        <td className={`px-3 py-2.5 text-right tabular-nums font-semibold text-xs ${isRisk ? 'text-red-600' : 'text-green-700'}`}>
                          {isRisk ? '-' : '+'}{fmtEur(weightedEur)}
                        </td>

                        {/* Comment */}
                        <td className="px-3 py-2.5 text-slate-500 text-xs max-w-[200px]">
                          <span className="truncate block" title={item.comment}>{item.comment}</span>
                          {item.sfdc_link && (
                            <a
                              href={item.sfdc_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-blue-500 hover:underline mt-0.5"
                            >
                              <ExternalLink size={10} /> SFDC
                            </a>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(item)}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="수정"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <ROModal
          initial={editTarget}
          customers={customers}
          defaultCustomerId={selectedCustomerId}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </main>
  );
}

// ─── R&O Modal ────────────────────────────────────────────────────────────────

interface ROModalProps {
  initial: ROItem | null;
  customers: Customer[];
  defaultCustomerId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function ROModal({ initial, customers, defaultCustomerId, onClose, onSaved }: ROModalProps) {
  const [form, setForm] = useState({
    customer_id:    initial?.customer_id ?? defaultCustomerId ?? '',
    product_id:     initial?.product_id ?? '',
    bf_code:        initial?.bf_code ?? '',
    year:           String(initial?.year ?? new Date().getFullYear()),
    quarter:        initial?.quarter ? String(initial.quarter) : '',
    type:           initial?.type ?? 'RISK',
    level:          initial?.level ?? 'M',
    raw_amount_krw: initial ? String(Math.round(Number(initial.raw_amount))) : '',
    comment:        initial?.comment ?? '',
    sfdc_link:      initial?.sfdc_link ?? '',
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Load products for dropdown
  useEffect(() => {
    fetch('/api/products').then(r => r.ok ? r.json() : []).then(setProducts).catch(() => {});
  }, []);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const rawKrw = parseFloat(form.raw_amount_krw) || 0;
  const levelWeight = WEIGHT[form.level as ROLevel] ?? 0.5;
  const weightedKrw = rawKrw * levelWeight;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const body = {
      customer_id:    form.customer_id,
      product_id:     form.product_id || undefined,
      bf_code:        form.bf_code || undefined,
      year:           parseInt(form.year),
      quarter:        form.quarter ? parseInt(form.quarter) : null,
      type:           form.type,
      level:          form.level,
      raw_amount_krw: parseFloat(form.raw_amount_krw),
      comment:        form.comment,
      sfdc_link:      form.sfdc_link || undefined,
    };

    const url    = initial ? `/api/ro/${initial.id}` : '/api/ro';
    const method = initial ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      setError(err.error ?? '저장 실패');
    } else {
      onSaved();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-900">
            {initial ? 'R&O 수정' : '신규 R&O 등록'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="px-6 py-5 space-y-4">
          {/* Customer */}
          <Field label="고객사 *">
            <select
              value={form.customer_id}
              onChange={e => set('customer_id', e.target.value)}
              className={inputCls}
              required
              style={{
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 8px center',
                backgroundSize: '14px',
                paddingRight: '32px',
              }}
            >
              <option value="">고객사 선택</option>
              {customers.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>

          {/* Type + Quarter */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="구분 *">
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className={inputCls}
                style={{
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '14px',
                  paddingRight: '32px',
                }}
              >
                <option value="RISK">RISK (위험)</option>
                <option value="OPPORTUNITY">OPPORTUNITY (기회)</option>
              </select>
            </Field>

            <Field label="분기">
              <select
                value={form.quarter}
                onChange={e => set('quarter', e.target.value)}
                className={inputCls}
                style={{
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '14px',
                  paddingRight: '32px',
                }}
              >
                <option value="">연간</option>
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </Field>
          </div>

          {/* Product / SBU (optional) */}
          {products.length > 0 && (
            <Field label="제품 / SBU (선택)">
              <select
                value={form.product_id}
                onChange={e => set('product_id', e.target.value)}
                className={inputCls}
                style={{
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '14px',
                  paddingRight: '32px',
                }}
              >
                <option value="">제품 미지정</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.sbu_code} · {p.sbu_name}
                    {p.bf_name ? ` (${p.bf_name})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {/* BF code fallback if no product selected */}
          {!form.product_id && (
            <Field label="BF 코드 (제품 미선택 시)">
              <input
                type="text"
                value={form.bf_code}
                onChange={e => set('bf_code', e.target.value)}
                className={inputCls}
                placeholder="예: BF-001"
              />
            </Field>
          )}

          {/* Raw amount + Level */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="원금 (KRW) *">
              <input
                type="number"
                value={form.raw_amount_krw}
                onChange={e => set('raw_amount_krw', e.target.value)}
                className={inputCls}
                placeholder="원 단위 입력"
                required
                min={0}
                step={1}
              />
              <p className="text-xs text-slate-400 mt-1">1억 = 100,000,000</p>
            </Field>

            <Field label="Level *">
              <select
                value={form.level}
                onChange={e => set('level', e.target.value)}
                className={inputCls}
                required
                style={{
                  appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%236b7280' d='M4 6l4 4 4-4'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 8px center',
                  backgroundSize: '14px',
                  paddingRight: '32px',
                }}
              >
                <option value="H">H — 75%</option>
                <option value="M">M — 50%</option>
                <option value="L">L — 25%</option>
              </select>
              {rawKrw > 0 && (
                <p className="text-xs text-blue-600 mt-1 font-medium">
                  가중 금액: {fmtKrwEok(weightedKrw)} KRW
                </p>
              )}
            </Field>
          </div>

          {/* Comment */}
          <Field label="Comment *">
            <textarea
              value={form.comment}
              onChange={e => set('comment', e.target.value)}
              className={`${inputCls} resize-none`}
              rows={3}
              required
              placeholder="R&O 사유를 입력하세요"
            />
          </Field>

          {/* SFDC Link */}
          <Field label="SFDC 링크 (선택)">
            <input
              type="url"
              value={form.sfdc_link}
              onChange={e => set('sfdc_link', e.target.value)}
              className={inputCls}
              placeholder="https://..."
            />
          </Field>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
