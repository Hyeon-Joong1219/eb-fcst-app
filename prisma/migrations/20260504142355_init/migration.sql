-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('AM', 'MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CustomerTier" AS ENUM ('A', 'B', 'C');

-- CreateEnum
CREATE TYPE "LifecycleStage" AS ENUM ('DISCOVERY', 'PRECLIN', 'PHASE1', 'PHASE2', 'PHASE3', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "SnapshotMonth" AS ENUM ('DECEMBER', 'JANUARY', 'FEBRUARY', 'APRIL', 'JUNE', 'AUGUST', 'OCTOBER', 'NOVEMBER');

-- CreateEnum
CREATE TYPE "ForecastStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "ROType" AS ENUM ('RISK', 'OPPORTUNITY', 'NON_REPEATED', 'DROPSHIP');

-- CreateEnum
CREATE TYPE "ROLevel" AS ENUM ('H', 'M', 'L');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('KRW', 'EUR', 'USD');

-- CreateEnum
CREATE TYPE "SfdcStage" AS ENUM ('IDENTIFIED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'AM',
    "password" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "sold_to_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_en" TEXT,
    "tier" "CustomerTier" NOT NULL DEFAULT 'C',
    "lifecycle_stage" "LifecycleStage" NOT NULL DEFAULT 'DISCOVERY',
    "region" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "owner_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "bu_code" TEXT NOT NULL,
    "bu_name" TEXT NOT NULL,
    "bf_code" TEXT NOT NULL,
    "bf_name" TEXT NOT NULL,
    "bf2_code" TEXT,
    "bf2_name" TEXT,
    "sbu_code" TEXT NOT NULL,
    "sbu_name" TEXT NOT NULL,
    "samsung_sub" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(12,4) NOT NULL,
    "is_op_rate" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_lines" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "snapshot_month" "SnapshotMonth" NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'KRW',
    "amount_krw" DECIMAL(18,4),
    "status" "ForecastStatus" NOT NULL DEFAULT 'DRAFT',
    "confidence_score" INTEGER DEFAULT 0,
    "is_highlighted" BOOLEAN NOT NULL DEFAULT false,
    "sfdc_oppty_id" TEXT,
    "sfdc_stage" "SfdcStage",
    "sfdc_win_rate" DECIMAL(5,4),
    "comment" TEXT,
    "prev_amount_krw" DECIMAL(18,4),
    "owner_id" TEXT NOT NULL,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuals" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "amount_krw" DECIMAL(18,4) NOT NULL,
    "source" TEXT NOT NULL,
    "ingested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ro_items" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT,
    "bf_code" TEXT,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "type" "ROType" NOT NULL,
    "level" "ROLevel" NOT NULL,
    "weight" DECIMAL(5,4) NOT NULL,
    "raw_amount" DECIMAL(18,4) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'EUR',
    "weighted_amount_krw" DECIMAL(18,4) NOT NULL,
    "sfdc_link" TEXT,
    "comment" TEXT NOT NULL,
    "requires_detail" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ro_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fcst_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_month" "SnapshotMonth" NOT NULL,
    "year" INTEGER NOT NULL,
    "frozen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "frozen_by" TEXT NOT NULL,

    CONSTRAINT "fcst_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fcst_snapshot_lines" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "amount_krw" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "fcst_snapshot_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "row_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "user_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_targets" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "bf_code" TEXT NOT NULL,
    "amount_krw" DECIMAL(18,4) NOT NULL,
    "set_by" TEXT NOT NULL,
    "set_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "manager_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "customers_sold_to_code_key" ON "customers"("sold_to_code");

-- CreateIndex
CREATE INDEX "customers_owner_id_idx" ON "customers"("owner_id");

-- CreateIndex
CREATE INDEX "customers_tier_idx" ON "customers"("tier");

-- CreateIndex
CREATE INDEX "customers_lifecycle_stage_idx" ON "customers"("lifecycle_stage");

-- CreateIndex
CREATE INDEX "products_bu_code_idx" ON "products"("bu_code");

-- CreateIndex
CREATE INDEX "products_bf_code_idx" ON "products"("bf_code");

-- CreateIndex
CREATE INDEX "products_sbu_code_idx" ON "products"("sbu_code");

-- CreateIndex
CREATE UNIQUE INDEX "products_bu_code_bf_code_sbu_code_key" ON "products"("bu_code", "bf_code", "sbu_code");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_year_currency_is_op_rate_key" ON "fx_rates"("year", "currency", "is_op_rate");

-- CreateIndex
CREATE INDEX "forecast_lines_customer_id_idx" ON "forecast_lines"("customer_id");

-- CreateIndex
CREATE INDEX "forecast_lines_product_id_idx" ON "forecast_lines"("product_id");

-- CreateIndex
CREATE INDEX "forecast_lines_year_quarter_idx" ON "forecast_lines"("year", "quarter");

-- CreateIndex
CREATE INDEX "forecast_lines_snapshot_month_idx" ON "forecast_lines"("snapshot_month");

-- CreateIndex
CREATE INDEX "forecast_lines_status_idx" ON "forecast_lines"("status");

-- CreateIndex
CREATE INDEX "forecast_lines_owner_id_idx" ON "forecast_lines"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_lines_customer_id_product_id_year_quarter_snapshot_key" ON "forecast_lines"("customer_id", "product_id", "year", "quarter", "snapshot_month");

-- CreateIndex
CREATE INDEX "actuals_customer_id_idx" ON "actuals"("customer_id");

-- CreateIndex
CREATE INDEX "actuals_year_quarter_idx" ON "actuals"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "actuals_customer_id_product_id_year_quarter_source_key" ON "actuals"("customer_id", "product_id", "year", "quarter", "source");

-- CreateIndex
CREATE INDEX "ro_items_customer_id_idx" ON "ro_items"("customer_id");

-- CreateIndex
CREATE INDEX "ro_items_year_idx" ON "ro_items"("year");

-- CreateIndex
CREATE INDEX "ro_items_type_idx" ON "ro_items"("type");

-- CreateIndex
CREATE UNIQUE INDEX "fcst_snapshots_snapshot_month_year_key" ON "fcst_snapshots"("snapshot_month", "year");

-- CreateIndex
CREATE INDEX "fcst_snapshot_lines_snapshot_id_idx" ON "fcst_snapshot_lines"("snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "fcst_snapshot_lines_snapshot_id_customer_id_product_id_year_key" ON "fcst_snapshot_lines"("snapshot_id", "customer_id", "product_id", "year", "quarter");

-- CreateIndex
CREATE INDEX "audit_log_table_row_id_idx" ON "audit_log"("table", "row_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- CreateIndex
CREATE INDEX "audit_log_ts_idx" ON "audit_log"("ts");

-- CreateIndex
CREATE UNIQUE INDEX "manager_targets_year_quarter_bf_code_key" ON "manager_targets"("year", "quarter", "bf_code");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_lines" ADD CONSTRAINT "forecast_lines_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuals" ADD CONSTRAINT "actuals_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_items" ADD CONSTRAINT "ro_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_items" ADD CONSTRAINT "ro_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ro_items" ADD CONSTRAINT "ro_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fcst_snapshots" ADD CONSTRAINT "fcst_snapshots_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fcst_snapshot_lines" ADD CONSTRAINT "fcst_snapshot_lines_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "fcst_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fcst_snapshot_lines" ADD CONSTRAINT "fcst_snapshot_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fcst_snapshot_lines" ADD CONSTRAINT "fcst_snapshot_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
