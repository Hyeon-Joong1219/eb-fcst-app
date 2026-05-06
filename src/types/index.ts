// 공통 타입 정의

export type UserRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type CustomerTier = 'A' | 'B' | 'C';
export type LifecycleStage = 'DISCOVERY' | 'PRECLIN' | 'PHASE1' | 'PHASE2' | 'PHASE3' | 'COMMERCIAL';
export type ForecastStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'LOCKED';
export type ROType = 'RISK' | 'OPPORTUNITY' | 'NON_REPEATED' | 'DROPSHIP';
export type ROLevel = 'H' | 'M' | 'L';
export type Currency = 'KRW' | 'EUR' | 'USD';
export type SnapshotMonth = 'DECEMBER' | 'JANUARY' | 'FEBRUARY' | 'APRIL' | 'JUNE' | 'AUGUST' | 'OCTOBER' | 'NOVEMBER';

/** AG Grid에서 사용하는 Forecast 그리드 행 타입 */
export interface ForecastGridRow {
  customerId: string;
  customerName: string;
  customerTier: CustomerTier;
  lifecycle: LifecycleStage;
  productId: string;
  sbuCode: string;
  sbuName: string;
  bfCode: string;
  bfName: string;
  buCode: string;
  // 분기별 FCST 금액 (KRW, 천원)
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
  fy: number | null;
  // 전년 실적 비교
  py_q1: number | null;
  py_q2: number | null;
  py_q3: number | null;
  py_q4: number | null;
  py_fy: number | null;
  // 메타
  status: ForecastStatus;
  confidence_score: number;
  is_highlighted: boolean;
  comment: string | null;
  sfdc_oppty_id: string | null;
}

/** Manager Dashboard용 Gap 분석 */
export interface BFGapRow {
  bfCode: string;
  bfName: string;
  bottomUp: number;   // AM 합산 (KRW)
  topDown: number;    // Manager 목표 (KRW)
  gap: number;        // bottomUp - topDown
  gapPct: number;     // gap / topDown
  lowConfidenceCount: number;
}

/** R&O 라인 */
export interface ROLineDisplay {
  id: string;
  customerName: string;
  sbuCode: string;
  type: ROType;
  level: ROLevel;
  weight: number;
  rawAmountEUR: number;
  weightedKRW: number;
  comment: string;
  sfdcLink: string | null;
}

/** Scenario 결과 (Best / Base / Worst) */
export interface ScenarioResult {
  base: number;
  best: number;   // base + Σ(Opportunity × 1.0)
  worst: number;  // base - Σ(Risk × 1.0)
}
