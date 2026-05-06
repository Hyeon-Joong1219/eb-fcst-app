# EB FCST App — Emerging Biotech Forecast Management System

> Merck Life Science Korea | Phase 0 Skeleton

---

## 프로젝트 개요

Samsung Biologics 전용 Excel FCST Tracker의 데이터 모델·로직을 그대로 계승하면서,
수십~수백 개 EB(Emerging Biotech) 고객을 효율적으로 관리하는 웹 앱입니다.

### 핵심 기능 (전체 Phase)
| Phase | 기능 |
|-------|------|
| 0 | DB 스키마·시드·인증 스켈레톤 ← **현재** |
| 1 | Customer/Product CRUD, AG Grid 기반 FCST 입력, CSV 임포트 |
| 2 | Run-rate 자동 베이스라인, Tiering, Snapshot 잠금/diff |
| 3 | R&O 모듈, Adjusted FCST, 시나리오(Best/Base/Worst), FX |
| 4 | 이상치 감지, SFDC 연동, Manager Dashboard |
| 5 | 모바일 뷰, PDF/Excel 리포트, E2E 테스트 |

---

## 빠른 시작

### 사전 요구사항
- Node.js ≥ 20
- PostgreSQL ≥ 15 (또는 Docker)
- npm ≥ 10

### 1. PostgreSQL 준비 (Docker 사용 시)
```bash
docker run -d \
  --name eb-fcst-pg \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=eb_fcst \
  -p 5432:5432 \
  postgres:16
```

### 2. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일 열어서 DATABASE_URL, NEXTAUTH_SECRET 수정
```

### 3. 의존성 설치
```bash
npm install
```

### 4. DB 마이그레이션 + 시드
```bash
npm run db:migrate     # Prisma migration (테이블 생성)
npm run db:seed        # 시드 데이터 삽입
```

### 5. 개발 서버 실행
```bash
npm run dev            # http://localhost:3000
```

### 6. (선택) Prisma Studio로 데이터 확인
```bash
npm run db:studio      # http://localhost:5555
```

---

## 디렉토리 구조

```
EB_FCST_App/
├── prisma/
│   ├── schema.prisma        ← DB 스키마 (11개 테이블)
│   └── seed.ts              ← 시드: FX·SBU 마스터·30 EB 고객·2024 Actuals
├── src/
│   ├── app/
│   │   ├── (auth)/login/    ← 로그인 페이지
│   │   ├── (app)/dashboard/ ← 대시보드 (Phase 1에서 채움)
│   │   └── api/             ← Next.js API Routes
│   ├── lib/
│   │   ├── auth.ts          ← NextAuth v5 설정
│   │   ├── db.ts            ← Prisma 클라이언트 싱글톤
│   │   └── utils.ts         ← KRW 포맷, MAPE, Z-score 등
│   └── types/index.ts       ← 공유 TypeScript 타입
├── .env.example
└── package.json
```

---

## DB 스키마 요약

| 테이블 | 역할 |
|--------|------|
| `users` | AM / Manager / Admin RBAC |
| `customers` | EB 고객 (Tier A/B/C, Lifecycle stage) |
| `products` | 7-tier SBU 계층 (Samsung Excel에서 추출) |
| `fx_rates` | EUR/USD → KRW OP FX (연도별 고정) |
| `forecast_lines` | FCST 데이터 장형 포맷 (고객×SBU×년도×분기×snapshot월) |
| `actuals` | BIS/SRM 실적 (ETL 수신) |
| `ro_items` | Risk & Opportunity (H/M/L 가중치) |
| `fcst_snapshots` | 월별 스냅샷 잠금 |
| `fcst_snapshot_lines` | 스냅샷 라인 |
| `manager_targets` | Top-down BF 단위 목표 |
| `audit_log` | 변경 이력 (누가·언제·왜) |

---

## 시드 데이터 (Phase 0)

| 항목 | 건수 |
|------|------|
| FX Rates (2023–2027, OP+Actual) | 12개 |
| SBU Master (Samsung Excel 추출) | 43개 |
| Users (Admin 1 + Manager 1 + AM 4) | 6명 |
| EB Customers (Tier A:6 / B:9 / C:15) | 30개 |
| Mock Actuals 2024 | ~300개 |

**시드 로그인 계정**

| 이메일 | 비밀번호 | 역할 |
|--------|---------|------|
| admin@merck.com | Admin1234! | Admin |
| manager@merck.com | Manager1234! | Manager |
| am1@merck.com | Am1234! | AM (담당: 셀트리온, SK바이오, 종근당, 큐로셀, ...) |
| am2@merck.com | Am1234! | AM (담당: 한미약품, 유한양행, 동아ST, ...) |
| am3@merck.com | Am1234! | AM (담당: 에이비엘바이오, 유바이오, ...) |
| am4@merck.com | Am1234! | AM (담당: 제넥신, 메디톡스, ...) |

---

## 기존 Excel 컨벤션 계승 현황

| Excel 컨벤션 | 앱 구현 |
|-------------|---------|
| 노란 셀 = 변경 셀 | `is_highlighted` 필드 + `cell-highlighted` CSS 클래스 |
| H/M/L = 0.75/0.5/0.25 | `ro_items.weight` + `roWeight` 유틸 |
| 500K↑ 코멘트 의무 | `requires_detail` 플래그 + 서버 validation |
| 8개 Snapshot 월 | `SnapshotMonth` enum (Dec/Jan/Feb/Apr/Jun/Aug/Oct/Nov) |
| EUR/KRW OP FX | `fx_rates.is_op_rate = true` |
| Δ vs Previous FCST | `forecast_lines.prev_amount_krw` |
| SFDC Link | `ro_items.sfdc_link` + `forecast_lines.sfdc_oppty_id` |

---

## 오픈 이슈 / 다음 단계 승인 요청

Phase 1 시작 전 아래 사항을 확인해주세요:

### 결정 필요
1. **PostgreSQL 환경**: 로컬 Docker vs 사내 온프렘 DB? → `DATABASE_URL` 확정 필요
2. **Auth 방식**: 현재 이메일/비밀번호 방식. Merck SSO(SAML/Azure AD) 연동이 필요한가?
3. **배포 대상**: Vercel(외부) vs 사내 온프렘 서버? → Next.js 빌드 설정 영향
4. **접속 범위**: 사내망 전용? VPN 필요? → CORS 및 CSP 설정 영향

### 가정한 사항 (추측 없이 명시)
- SBU 마스터는 Samsung Excel의 LP2/LP3 계층을 EB에도 그대로 적용했습니다. **EB 전용으로 다른 SBU 라인업이 있다면 알려주세요.**
- Mock Actuals는 `source = 'Manual'`로 입력했습니다. BIS/SRM ETL 일정·접근 권한이 확정되면 Phase 1에서 실제 연동 어댑터를 붙입니다.
- Lifecycle 성장률 프리셋(Discovery 20% → Commercial 5%)은 Phase 2 Run-rate 엔진 구현 시 AM이 조정할 수 있도록 admin 설정으로 처리할 예정입니다. **초기값 동의하시면 그대로 진행합니다.**
- 화폐 입력 기본값은 KRW로 설정했습니다. EUR 입력이 주류인 SBU가 있다면 알려주세요.
