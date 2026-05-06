'use client';

import { useEffect, useState } from 'react';
import { Save, Plus } from 'lucide-react';

interface FxRate {
  id: string;
  year: number;
  currency: string;
  rate: string;
  is_op_rate: boolean;
  note?: string;
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1, CURRENT_YEAR + 2];

export default function FxAdminPage() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/fx-rates').then(r => r.json()).then(setRates);
  }, []);

  function getRate(year: number, currency: string, isOp: boolean) {
    return rates.find(r => r.year === year && r.currency === currency && r.is_op_rate === isOp);
  }

  function editKey(year: number, currency: string, isOp: boolean) {
    return `${year}_${currency}_${isOp}`;
  }

  function getValue(year: number, currency: string, isOp: boolean) {
    const key = editKey(year, currency, isOp);
    if (editValues[key] !== undefined) return editValues[key];
    return getRate(year, currency, isOp)?.rate ?? '';
  }

  async function save(year: number, currency: string, isOp: boolean) {
    const key = editKey(year, currency, isOp);
    const rate = parseFloat(editValues[key] ?? getRate(year, currency, isOp)?.rate ?? '0');
    if (!rate) return;
    setSaving(key);
    const res = await fetch('/api/fx-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, currency, rate, is_op_rate: isOp }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRates(prev => {
        const filtered = prev.filter(r => !(r.year === year && r.currency === currency && r.is_op_rate === isOp));
        return [...filtered, updated];
      });
      setEditValues(prev => { const n = { ...prev }; delete n[key]; return n; });
    }
    setSaving(null);
  }

  return (
    <main className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">FX 환율 설정</h1>
        <p className="text-slate-500 text-sm mt-1">
          KRW 입력값 ÷ OP FX rate = EUR 자동 계산에 사용됩니다.
          연도별 EUR/KRW, USD/KRW 환율을 설정하세요.
        </p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">연도</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">통화</th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">구분</th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700">환율 (1 EUR/USD = ? KRW)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {YEARS.flatMap(year =>
              ['EUR', 'USD'].map(currency => {
                const key = editKey(year, currency, true);
                const dirty = editValues[key] !== undefined;
                return (
                  <tr key={key} className={dirty ? 'bg-yellow-50' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-3 font-medium text-slate-900">{year}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${currency === 'EUR' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                        {currency}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800 font-semibold">OP Rate</span>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        step="0.01"
                        value={getValue(year, currency, true)}
                        onChange={e => setEditValues(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="환율 입력"
                        className="w-40 text-right px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ml-auto block"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => save(year, currency, true)}
                        disabled={saving === key || !dirty}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        <Save size={12} />
                        {saving === key ? '저장 중...' : '저장'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-800">
        <strong>사용 예시:</strong> 2026 EUR OP Rate = 1,409 설정 시<br />
        KRW 1,409,000 입력 → EUR 1,000.00 자동 계산
      </div>
    </main>
  );
}
