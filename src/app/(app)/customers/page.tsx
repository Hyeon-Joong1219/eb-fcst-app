'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Customer {
  id: string;
  sold_to_code: string;
  name: string;
  name_en?: string;
  tier: 'A' | 'B' | 'C';
  region?: string;
  owner: { id: string; name: string };
}

interface AppUser {
  id: string;
  name: string;
  name_en?: string;
  role: string;
}

const TIER_LABELS: Record<string, string> = { A: 'Tier A', B: 'Tier B', C: 'Tier C' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers]         = useState<AppUser[]>([]);
  const [search, setSearch]       = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [amFilter, setAmFilter]   = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [loading, setLoading]     = useState(true);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (tierFilter) params.set('tier', tierFilter);
    const [custData, userData] = await Promise.all([
      fetch(`/api/customers?${params}`).then(r => r.json()),
      fetch('/api/users').then(r => r.ok ? r.json() : []),
    ]);
    setCustomers(custData);
    setUsers(userData);
    setLoading(false);
  }

  useEffect(() => { load(); }, [tierFilter]);

  const filtered = customers.filter(c => {
    if (amFilter && c.owner.id !== amFilter) return false;
    if (!search) return true;
    return (
      c.name.includes(search) ||
      (c.name_en ?? '').toLowerCase().includes(search.toLowerCase()) ||
      c.sold_to_code.includes(search)
    );
  });

  const tierCount = { A: 0, B: 0, C: 0 };
  customers.forEach(c => { tierCount[c.tier]++; });

  return (
    <main className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">고객 관리</h1>
          <p className="text-slate-500 text-sm mt-1">전체 {customers.length}개 EB 고객</p>
        </div>
        <button
          onClick={() => { setEditTarget(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} /> 고객 추가
        </button>
      </div>

      {/* Tier 통계 카드 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['A', 'B', 'C'] as const).map(tier => (
          <button
            key={tier}
            onClick={() => setTierFilter(tierFilter === tier ? '' : tier)}
            className={cn(
              'p-4 rounded-xl border text-left transition-all',
              tierFilter === tier ? 'ring-2 ring-blue-500 border-blue-200 bg-blue-50' : 'bg-white hover:shadow-sm',
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={cn('px-2 py-0.5 rounded text-xs font-bold', tier === 'A' ? 'tier-a' : tier === 'B' ? 'tier-b' : 'tier-c')}>
                {TIER_LABELS[tier]}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">{tierCount[tier]}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {tier === 'A' ? '라인-레벨 수동 입력' : tier === 'B' ? 'Run-rate 자동 제안' : 'Statistical baseline'}
            </p>
          </button>
        ))}
      </div>

      {/* 검색 + AM 필터 */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="고객명, 영문명, Sold-to 코드 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {users.length > 0 && (
          <select
            value={amFilter}
            onChange={e => setAmFilter(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 AM</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">고객사</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Sold-to</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">Tier</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">지역</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">담당 AM</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-slate-400">고객이 없습니다</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  {c.name_en && <p className="text-xs text-slate-400">{c.name_en}</p>}
                </td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{c.sold_to_code}</td>
                <td className="px-4 py-3">
                  <span className={cn('px-2 py-0.5 rounded text-xs font-bold', c.tier === 'A' ? 'tier-a' : c.tier === 'B' ? 'tier-b' : 'tier-c')}>
                    {TIER_LABELS[c.tier]}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">{c.region ?? '—'}</td>
                <td className="px-4 py-3 text-slate-600">{c.owner.name}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => { setEditTarget(c); setShowForm(true); }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <CustomerForm
          initial={editTarget}
          users={users}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </main>
  );
}

// ─── 편집 모달 ────────────────────────────────────────────────────────────────
function CustomerForm({
  initial, users, onClose, onSaved,
}: {
  initial: Customer | null;
  users: AppUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    sold_to_code: initial?.sold_to_code ?? '',
    name:         initial?.name ?? '',
    name_en:      initial?.name_en ?? '',
    tier:         initial?.tier ?? 'C',
    region:       initial?.region ?? '',
    owner_id:     initial?.owner.id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const url    = initial ? `/api/customers/${initial.id}` : '/api/customers';
    const method = initial ? 'PATCH' : 'POST';

    // POST는 lifecycle_stage 필수 — DISCOVERY 기본값
    const body = initial
      ? form
      : { ...form, lifecycle_stage: 'DISCOVERY' };

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

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-slate-900 mb-4">
          {initial ? '고객 수정' : '신규 고객 등록'}
        </h2>
        <form onSubmit={submit} className="space-y-3">
          {!initial && (
            <Field label="Sold-to 코드">
              <input value={form.sold_to_code} onChange={e => set('sold_to_code', e.target.value)}
                className={inputCls} placeholder="0652103254" required />
            </Field>
          )}
          <Field label="고객사명 (한글)">
            <input value={form.name} onChange={e => set('name', e.target.value)}
              className={inputCls} required />
          </Field>
          <Field label="영문명">
            <input value={form.name_en} onChange={e => set('name_en', e.target.value)}
              className={inputCls} />
          </Field>

          {/* 담당 AM */}
          <Field label="담당 AM">
            {users.length > 0 ? (
              <select value={form.owner_id} onChange={e => set('owner_id', e.target.value)}
                className={inputCls} required>
                <option value="">선택하세요</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.name_en ? ` (${u.name_en})` : ''} — {u.role}
                  </option>
                ))}
              </select>
            ) : (
              <input value={form.owner_id} onChange={e => set('owner_id', e.target.value)}
                className={inputCls} placeholder="User ID" />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Tier">
              <select value={form.tier} onChange={e => set('tier', e.target.value)} className={inputCls}>
                <option value="A">A — 대형</option>
                <option value="B">B — 중형</option>
                <option value="C">C — 소형</option>
              </select>
            </Field>
            <Field label="지역">
              <select value={form.region} onChange={e => set('region', e.target.value)} className={inputCls}>
                <option value="">미지정</option>
                <option value="수도권">수도권</option>
                <option value="충청">충청</option>
                <option value="영남">영남</option>
                <option value="호남">호남</option>
              </select>
            </Field>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50">
              취소
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls = 'w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
