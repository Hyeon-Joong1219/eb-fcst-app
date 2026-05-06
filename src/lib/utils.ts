import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** KRW 금액을 한국 비즈니스 표준으로 포맷 (천원 단위, 억 단위 표시) */
export function formatKRW(amount: number, unit: 'K' | 'M' | 'B' = 'M'): string {
  const divisors = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
  const labels = { K: '천원', M: '백만원', B: '억원' };
  const val = amount / divisors[unit];
  return `${val.toLocaleString('ko-KR', { maximumFractionDigits: 1 })} ${labels[unit]}`;
}

/** EUR/USD → KRW 환산 */
export function toKRW(amount: number, currency: 'EUR' | 'USD', rate: number): number {
  return Math.round(amount * rate);
}

/** MAPE 계산 */
export function calcMAPE(actuals: number[], forecasts: number[]): number {
  if (actuals.length !== forecasts.length || actuals.length === 0) return 0;
  const sum = actuals.reduce((acc, actual, i) => {
    if (actual === 0) return acc;
    return acc + Math.abs((actual - forecasts[i]) / actual);
  }, 0);
  return (sum / actuals.length) * 100;
}

/** Z-score 이상치 감지 */
export function zScore(value: number, mean: number, std: number): number {
  if (std === 0) return 0;
  return (value - mean) / std;
}

/** 분기 레이블 */
export function quarterLabel(year: number, quarter: number): string {
  return `${year}Q${quarter}`;
}

/** Snapshot 월 → 한글 레이블 */
export const snapshotMonthLabel: Record<string, string> = {
  DECEMBER: '12월(Dec)',
  JANUARY: '1월(Jan)',
  FEBRUARY: '2월(Feb)',
  APRIL: '4월(Apr)',
  JUNE: '6월(Jun)',
  AUGUST: '8월(Aug)',
  OCTOBER: '10월(Oct)',
  NOVEMBER: '11월(Nov)',
};

/** SFDC Stage → Win Rate 매핑 (기본값, AM 오버라이드 가능) */
export const sfdcWinRate: Record<string, number> = {
  IDENTIFIED: 0.10,
  QUALIFIED: 0.30,
  PROPOSAL: 0.50,
  NEGOTIATION: 0.75,
  WON: 1.00,
  LOST: 0.00,
};

/** R&O Level → Weight */
export const roWeight: Record<string, number> = {
  H: 0.75,
  M: 0.50,
  L: 0.25,
};
