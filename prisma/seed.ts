/**
 * Prisma Seed — EB FCST App Phase 0
 *
 * 포함 데이터:
 *   1) FX Rates (2023–2026 OP/Actual)
 *   2) SBU Master — Samsung FCST Tracker에서 추출한 실제 계층 데이터
 *   3) Users — 4 AM + 1 Manager + 1 Admin
 *   4) 30 EB Customers — Tier A/B/C × Lifecycle stage
 *   5) 2024 Mock Actuals — Tier A·B 고객 주요 SBU
 */

import { PrismaClient, CustomerTier, LifecycleStage, Currency, ROLevel, ROType, SnapshotMonth } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// 1. FX RATES
// ─────────────────────────────────────────────────────────────────────────────
const fxRates = [
  // Actual FX (참고용, OP FX와 별도 보관)
  { year: 2023, currency: Currency.EUR, rate: '1613.0000', is_op_rate: false, note: 'EUR/KRW 2023 Actual (Samsung FCST 기준)' },
  { year: 2023, currency: Currency.USD, rate: '1289.7000', is_op_rate: false, note: 'USD/KRW 2023 Actual' },
  { year: 2024, currency: Currency.EUR, rate: '1613.0000', is_op_rate: false, note: 'EUR/KRW 2024 Actual (Samsung FCST 기준)' },
  { year: 2024, currency: Currency.USD, rate: '1289.7000', is_op_rate: false, note: 'USD/KRW 2024 Actual' },
  { year: 2025, currency: Currency.EUR, rate: '1613.0000', is_op_rate: false, note: 'EUR/KRW 2025 Actual (Samsung FCST 기준)' },
  { year: 2025, currency: Currency.USD, rate: '1289.7000', is_op_rate: false, note: 'USD/KRW 2025 Actual' },
  // OP FX (보고 통화 환산에 사용)
  { year: 2025, currency: Currency.EUR, rate: '1480.0000', is_op_rate: true, note: 'EUR/KRW OP25 FX (Operating Plan)' },
  { year: 2025, currency: Currency.USD, rate: '1289.7000', is_op_rate: true, note: 'USD/KRW OP25 FX' },
  { year: 2026, currency: Currency.EUR, rate: '1409.0000', is_op_rate: true, note: 'EUR/KRW OP26 FX — 2026 R&O 시트 기준' },
  { year: 2026, currency: Currency.USD, rate: '1289.7000', is_op_rate: true, note: 'USD/KRW OP26 FX' },
  { year: 2027, currency: Currency.EUR, rate: '1350.0000', is_op_rate: true, note: 'EUR/KRW OP27 FX (가정치)' },
  { year: 2027, currency: Currency.USD, rate: '1250.0000', is_op_rate: true, note: 'USD/KRW OP27 FX (가정치)' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. SBU MASTER — Samsung FCST Tracker Excel에서 추출한 실제 계층
//    EB 고객에게도 동일 제품 계층 적용
// ─────────────────────────────────────────────────────────────────────────────
const products = [
  // ── LP2 BioProcessing / C22 Cell Culture ────────────────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'L7', bf2_name: 'Cell Culture - MM',   sbu_code: '669',  sbu_name: 'AO Supplements',                        samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'L7', bf2_name: 'Cell Culture - MM',   sbu_code: '674',  sbu_name: 'Cell Culture Media',                    samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: '806',  sbu_name: 'Dry Powder Media',                      samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: '842',  sbu_name: 'Sera',                                  samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: '843',  sbu_name: 'Custom Trypsin',                        samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: '844',  sbu_name: 'AO Trypsin',                            samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: '845',  sbu_name: 'Biopharmaceutical Expression Systems',  samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: 'P13',  sbu_name: 'Upstream Liquids',                      samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: 'P61',  sbu_name: 'Cell Therapy',                          samsung_sub: 'CCM, Chrom' },

  // ── LP2 BioProcessing / C27 Purification ─────────────────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'NS', bf2_name: 'Natrix Separations', sbu_code: 'NAT', sbu_name: 'Natrix Separations',            samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'P2', bf2_name: 'Purification',       sbu_code: 'P21', sbu_name: 'Affinity Chromatography Media', samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'P2', bf2_name: 'Purification',       sbu_code: 'P22', sbu_name: 'IEX Chromatography Media',      samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'P2', bf2_name: 'Purification',       sbu_code: 'P23', sbu_name: 'Inorganic Sorbents',            samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'P2', bf2_name: 'Purification',       sbu_code: 'P24', sbu_name: 'Prepacked Columns',             samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C27', bf_name: 'Purification', bf2_code: 'P2', bf2_name: 'Purification',       sbu_code: '663', sbu_name: 'Clarification Products (RB)',   samsung_sub: 'Filters'    },

  // ── LP2 BioProcessing / C25 Aseptic ──────────────────────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C25', bf_name: 'Aseptic', bf2_code: 'P1', bf2_name: 'Aseptic', sbu_code: '738', sbu_name: 'Durapore Cartridges & Capsules',          samsung_sub: 'Filters' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C25', bf_name: 'Aseptic', bf2_code: 'P1', bf2_name: 'Aseptic', sbu_code: '739', sbu_name: 'Express Cartridges & Capsules',           samsung_sub: 'Filters' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C25', bf_name: 'Aseptic', bf2_code: 'P1', bf2_name: 'Aseptic', sbu_code: '740', sbu_name: 'Gas Cartridges & Capsules',               samsung_sub: 'Filters' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C25', bf_name: 'Aseptic', bf2_code: 'P1', bf2_name: 'Aseptic', sbu_code: '741', sbu_name: 'Pre/Depth Filter Cartridges & Capsules', samsung_sub: 'Filters' },

  // ── LP2 BioProcessing / C26 Downstream ───────────────────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C26', bf_name: 'Downstream', bf2_code: 'J5', bf2_name: 'Downstream', sbu_code: '660', sbu_name: 'Virus Removal Products (RE)', samsung_sub: 'Filters' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C26', bf_name: 'Downstream', bf2_code: 'J5', bf2_name: 'Downstream', sbu_code: '664', sbu_name: 'TFF Expendables (RC)',         samsung_sub: 'Filters' },

  // ── LP2 BioProcessing / C24 Single-Use/Hardware ───────────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '656', sbu_name: 'Mobius Disposable Assemblies (RS)',   samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '657', sbu_name: 'Single-Use Bioreactors Assemblies', samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '744', sbu_name: 'Single-Use Systems Assemblies',     samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '841', sbu_name: 'Final Fill',                        samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'QQ', bf2_name: 'Single-Use Systems HDW', sbu_code: 'P68', sbu_name: 'Single-Use Bioreactors Systems (RX)', samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'QQ', bf2_name: 'Single-Use Systems HDW', sbu_code: 'P71', sbu_name: 'Single-Use Systems',                   samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware', sbu_code: 'P08', sbu_name: 'Standard Hardware',   samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware', sbu_code: 'P09', sbu_name: 'Custom Hardware',     samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware', sbu_code: '666', sbu_name: 'Housings (RU)',       samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM', sbu_code: '746', sbu_name: 'Equipment Installation and Qualification Services', samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM', sbu_code: '747', sbu_name: 'Equipment Maintenance Services',               samsung_sub: 'HWs' },

  // ── LP3 Process & Formulation / C23 BioPharma Materials ─────────────────
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'L8', bf2_name: 'BioPharma Materials - MM',   sbu_code: '670', sbu_name: 'NAO Supplements & Manufacturing Aids', samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'L8', bf2_name: 'BioPharma Materials - MM',   sbu_code: 'P01', sbu_name: 'USP Chemicals MM',                    samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'L8', bf2_name: 'BioPharma Materials - MM',   sbu_code: 'P02', sbu_name: 'DSP Functional Chemicals MM',           samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'L8', bf2_name: 'BioPharma Materials - MM',   sbu_code: 'P10', sbu_name: 'Powder Buffers MM',                    samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'LM', bf2_name: 'BioPharma Materials - SIAL', sbu_code: '807', sbu_name: 'Growth Factors',                       samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'LM', bf2_name: 'BioPharma Materials - SIAL', sbu_code: 'P03', sbu_name: 'USP Chemicals SIAL',                   samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'LM', bf2_name: 'BioPharma Materials - SIAL', sbu_code: 'P04', sbu_name: 'Powder Buffers SIAL',                  samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'LM', bf2_name: 'BioPharma Materials - SIAL', sbu_code: 'P07', sbu_name: 'BioPharm Materials Specialty Chemicals SIAL', samsung_sub: 'BPM' },

  // ── LP3 Process & Formulation / C28 API ──────────────────────────────────
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: 'P34', sbu_name: 'API - MM',             samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: 'P35', sbu_name: 'GMP Raw Materials - MM', samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: 'P38', sbu_name: 'Pharm Materials - SIAL', samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'P8', bf2_name: 'Folates',         sbu_code: 'P31', sbu_name: 'Folates & Innovative Technologies', samsung_sub: 'BPM' },

  // ── LP3 Process & Formulation / C29 Formulation ──────────────────────────
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C29', bf_name: 'Formulation', bf2_code: 'P7', bf2_name: 'Excipients', sbu_code: '677', sbu_name: 'Solid Application',      samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C29', bf_name: 'Formulation', bf2_code: 'P7', bf2_name: 'Excipients', sbu_code: '678', sbu_name: 'Liquid Application',     samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C29', bf_name: 'Formulation', bf2_code: 'P7', bf2_name: 'Excipients', sbu_code: 'P32', sbu_name: 'Biopharm Ingredients',   samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C29', bf_name: 'Formulation', bf2_code: 'P7', bf2_name: 'Excipients', sbu_code: 'P37', sbu_name: 'Formulation - SIAL',     samsung_sub: 'BPM' },

  // ── LP2 BioProcessing / C22 Cell Culture — 추가 항목 ─────────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: 'P06', sbu_name: 'Processing Solutions SIAL',       samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: 'P12', sbu_name: 'Immediate Advantage and Services', samsung_sub: 'CCM, Chrom' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C22', bf_name: 'Cell Culture', bf2_code: 'LL', bf2_name: 'Cell Culture - SIAL', sbu_code: 'P14', sbu_name: 'Media Development Services',       samsung_sub: 'CCM, Chrom' },

  // ── LP2 BioProcessing / C24 Single-Use — 추가 Single-Use 항목 ────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '658', sbu_name: 'Sterile Sampling (TG)',                samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '742', sbu_name: 'Mobius Disposable Mixing Assemblies',  samsung_sub: 'SU' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'N9', bf2_name: 'Single-Use', sbu_code: '743', sbu_name: 'Disposable Connectors',                samsung_sub: 'SU' },

  // ── LP2 BioProcessing / C24 Hardware — 추가 Hardware 항목 ────────────────
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: '5P', bf2_name: 'FDS',                    sbu_code: 'P60',  sbu_name: 'FDS',                                                       samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'MA', bf2_name: 'MAST',                   sbu_code: 'MA1',  sbu_name: 'MAST',                                                      samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware',        sbu_code: '662',  sbu_name: 'Integrity Testers (RH)',                                    samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware',        sbu_code: '668',  sbu_name: 'NovAseptic Systems Components (RT)',                        samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'P3', bf2_name: 'Systems Hardware',        sbu_code: 'P15',  sbu_name: 'BioProcessing Software',                                    samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q0', bf2_name: 'POC Entries PS',          sbu_code: 'P57',  sbu_name: 'POC Entries PS',                                            samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: '653',  sbu_name: 'Global Customer Training & BSN (NA)',                       samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: '655',  sbu_name: 'BioDevelopment and Manufacturing Support Services (RW)',    samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: '748',  sbu_name: 'Equipment Spare Parts',                                     samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: '749',  sbu_name: 'Core Validation Services',                                  samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: '750',  sbu_name: 'E&L Validation Services',                                   samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'Q9', bf2_name: 'Field Services - MM',     sbu_code: 'Q13',  sbu_name: 'Consultancy Services PS',                                   samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'QQ', bf2_name: 'Single-Use Systems HDW',  sbu_code: 'P67',  sbu_name: 'Mobius Assemblies Transport and Storage Systems',           samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'QQ', bf2_name: 'Single-Use Systems HDW',  sbu_code: 'P70',  sbu_name: 'Mobius Disposable Mixing Systems',                          samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'RS', bf2_name: 'PAT Solutions',           sbu_code: 'RSP',  sbu_name: 'PAT Solutions',                                             samsung_sub: 'HWs' },
  { bu_code: 'LP2', bu_name: 'BioProcessing', bf_code: 'C24', bf_name: 'Single-Use/Hardware', bf2_code: 'EL', bf2_name: 'Electra',                 sbu_code: 'EL1',  sbu_name: 'Electra',                                                   samsung_sub: 'HWs' },

  // ── LP3 Process & Formulation / C23 BioPharma Materials — 추가 항목 ───────
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'L8', bf2_name: 'BioPharma Materials - MM',   sbu_code: 'P11', sbu_name: 'Processing Solutions MM',         samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C23', bf_name: 'BioPharma Materials', bf2_code: 'LM', bf2_name: 'BioPharma Materials - SIAL', sbu_code: 'P05', sbu_name: 'DSP Functional Chemicals SIAL',   samsung_sub: 'BPM' },

  // ── LP3 Process & Formulation / C28 API — 추가 항목 ─────────────────────
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: '682', sbu_name: 'Non-GMP Raw Materials - MM', samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: 'P33', sbu_name: 'Cleaning in Place',           samsung_sub: 'BPM' },
  { bu_code: 'LP3', bu_name: 'Process & Formulation Materials', bf_code: 'C28', bf_name: 'API', bf2_code: 'L9', bf2_name: 'Pharm Materials', sbu_code: 'P49', sbu_name: 'API - SIAL',                  samsung_sub: 'BPM' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. USERS
// ─────────────────────────────────────────────────────────────────────────────
const usersData = [
  { email: 'admin@merck.com',    name: '시스템관리자',  name_en: 'System Admin',    role: 'ADMIN'   as const, password: 'Admin1234!' },
  { email: 'manager@merck.com',  name: '팀장',          name_en: 'Team Manager',    role: 'MANAGER' as const, password: 'Manager1234!' },
  { email: 'am1@merck.com',      name: '김민준',        name_en: 'Minjun Kim',      role: 'AM'      as const, password: 'Am1234!' },
  { email: 'am2@merck.com',      name: '이서연',        name_en: 'Seoyeon Lee',     role: 'AM'      as const, password: 'Am1234!' },
  { email: 'am3@merck.com',      name: '박지우',        name_en: 'Jiwoo Park',      role: 'AM'      as const, password: 'Am1234!' },
  { email: 'am4@merck.com',      name: '최유진',        name_en: 'Yujin Choi',      role: 'AM'      as const, password: 'Am1234!' },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. EB CUSTOMERS (30개)
//    Tier A: top 20% → 6개, Tier B: next 30% → 9개, Tier C: long-tail 50% → 15개
// ─────────────────────────────────────────────────────────────────────────────
// am_index 0~3 = am1~am4 (users 배열에서 오프셋 2부터 시작)
const customersData = [
  // ══ Tier A: Commercial / Large Scale ══════════════════════════════════════
  { sold_to_code: 'EB-A001', name: '셀트리온',          name_en: 'Celltrion',            tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '충청', am_index: 0 },
  { sold_to_code: 'EB-A002', name: 'SK바이오사이언스',   name_en: 'SK Bioscience',        tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 0 },
  { sold_to_code: 'EB-A003', name: '한미약품',           name_en: 'Hanmi Pharma',         tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 1 },
  { sold_to_code: 'EB-A004', name: '유한양행',           name_en: 'Yuhan Corp',           tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 1 },
  { sold_to_code: 'EB-A005', name: '종근당',             name_en: 'Chong Kun Dang',       tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 0 },
  { sold_to_code: 'EB-A006', name: '동아ST',             name_en: 'Dong-A ST',            tier: CustomerTier.A, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 1 },

  // ══ Tier B: Phase 2/3 or Mid-scale Commercial ═════════════════════════════
  { sold_to_code: 'EB-B001', name: '에이비엘바이오',     name_en: 'ABL Bio',              tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE3,     region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-B002', name: '유바이오로직스',     name_en: 'EuBiologics',          tier: CustomerTier.B, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-B003', name: '제넥신',             name_en: 'Genexine',             tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE3,     region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-B004', name: '메디톡스',           name_en: 'Medytox',              tier: CustomerTier.B, lifecycle_stage: LifecycleStage.COMMERCIAL, region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-B005', name: '코오롱생명과학',     name_en: 'Kolon Life Science',   tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE2,     region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-B006', name: '파멥신',             name_en: 'Pharmabcine',          tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE2,     region: '충청', am_index: 2 },
  { sold_to_code: 'EB-B007', name: '앱클론',             name_en: 'AbClon',               tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE2,     region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-B008', name: '지아이이노베이션',   name_en: 'GI Innovation',        tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE2,     region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-B009', name: '보로노이',           name_en: 'Voronoi',              tier: CustomerTier.B, lifecycle_stage: LifecycleStage.PHASE2,     region: '수도권', am_index: 2 },

  // ══ Tier C: Phase 1 / PreClin / Discovery ════════════════════════════════
  { sold_to_code: 'EB-C001', name: '큐로셀',             name_en: 'CuroCELL',             tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '수도권', am_index: 0 },
  { sold_to_code: 'EB-C002', name: '올릭스',             name_en: 'OliX',                 tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '충청', am_index: 1 },
  { sold_to_code: 'EB-C003', name: '아이진',             name_en: 'Eyegene',              tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE2,     region: '수도권', am_index: 1 },
  { sold_to_code: 'EB-C004', name: '압타바이오',         name_en: 'AptaBio',              tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-C005', name: '바이오오케스트라',   name_en: 'Bio Orchestra',        tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-C006', name: '이뮨메드',           name_en: 'ImmunoMed',            tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '영남', am_index: 0 },
  { sold_to_code: 'EB-C007', name: '지앤피바이오사이언스', name_en: 'GnP Bioscience',     tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PRECLIN,    region: '수도권', am_index: 1 },
  { sold_to_code: 'EB-C008', name: '카나프테라퓨틱스',   name_en: 'Kanaf Therapeutics',   tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PRECLIN,    region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-C009', name: '크리스탈지노믹스',   name_en: 'Crystal Genomics',     tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '수도권', am_index: 3 },
  { sold_to_code: 'EB-C010', name: '온코크로스',         name_en: 'OncoCross',            tier: CustomerTier.C, lifecycle_stage: LifecycleStage.DISCOVERY,  region: '수도권', am_index: 0 },
  { sold_to_code: 'EB-C011', name: '티카로스',           name_en: 'Ticaros',              tier: CustomerTier.C, lifecycle_stage: LifecycleStage.DISCOVERY,  region: '수도권', am_index: 1 },
  { sold_to_code: 'EB-C012', name: '젠큐릭스',           name_en: 'GenCurix',             tier: CustomerTier.C, lifecycle_stage: LifecycleStage.DISCOVERY,  region: '수도권', am_index: 2 },
  { sold_to_code: 'EB-C013', name: '바이오솔릭스',       name_en: 'Biosolyx',             tier: CustomerTier.C, lifecycle_stage: LifecycleStage.DISCOVERY,  region: '충청', am_index: 3 },
  { sold_to_code: 'EB-C014', name: '노을',               name_en: 'Noul',                 tier: CustomerTier.C, lifecycle_stage: LifecycleStage.DISCOVERY,  region: '수도권', am_index: 0 },
  { sold_to_code: 'EB-C015', name: '지놈앤컴퍼니',       name_en: 'Genome & Company',     tier: CustomerTier.C, lifecycle_stage: LifecycleStage.PHASE1,     region: '수도권', am_index: 1 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. MOCK ACTUALS 생성 헬퍼 (2024년 4개 분기)
// ─────────────────────────────────────────────────────────────────────────────
// 고객 Tier별 baseline 금액 (KRW, 천원 단위)
const tierBaseKRW: Record<string, number> = {
  A: 500_000,  // Tier A: 평균 500백만원/분기/SBU
  B: 80_000,   // Tier B: 평균 80백만원/분기/SBU
  C: 10_000,   // Tier C: 평균 10백만원/분기/SBU (sparse)
};

// SBU별 가중치 (인기 제품은 higher)
const sbuWeights: Record<string, number> = {
  '674': 3.0, '738': 2.5, '739': 2.0, '741': 2.0,  // Cell Culture, Filters
  '742': 2.0, '744': 2.5, '656': 1.8,               // Single-Use
  '660': 1.5, '664': 1.5,                            // Downstream
  'P21': 1.2, 'P22': 1.0,                            // Purification
  '670': 0.8, 'P01': 0.7, 'P10': 0.6,               // BioPharma Materials
};

// Tier별 활성 SBU 코드 (EB 고객 구매 패턴)
const tierSBUs: Record<string, string[]> = {
  A: ['674', '806', '842', '738', '739', '741', '744', '656', '660', '664', 'P21', '670', 'P01'],
  B: ['674', '842', '738', '741', '744', '660', 'P21', '670'],
  C: ['674', '738', '741'],  // Tier C는 소수 SBU만
};

// 분기별 계절성 지수 (Q1~Q4)
const seasonality = [0.9, 1.0, 1.05, 1.05];

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Seeding EB FCST App...');

  // ── 1. FX Rates ──────────────────────────────────────────────────────────
  console.log('  [1/5] FX Rates...');
  for (const fx of fxRates) {
    await prisma.fxRate.upsert({
      where: { year_currency_is_op_rate: { year: fx.year, currency: fx.currency, is_op_rate: fx.is_op_rate } },
      update: { rate: fx.rate, note: fx.note },
      create: {
        year: fx.year,
        currency: fx.currency,
        rate: fx.rate,
        is_op_rate: fx.is_op_rate,
        effective_from: new Date(`${fx.year}-01-01`),
        note: fx.note,
      },
    });
  }
  console.log(`     ✓ ${fxRates.length}개 FX Rate 등록`);

  // ── 2. Products (SBU Master) ──────────────────────────────────────────────
  console.log('  [2/5] SBU Master...');
  const productRecords: Record<string, { id: string }> = {};
  for (const p of products) {
    const prod = await prisma.product.upsert({
      where: { bu_code_bf_code_sbu_code: { bu_code: p.bu_code, bf_code: p.bf_code, sbu_code: p.sbu_code } },
      update: { sbu_name: p.sbu_name, bf_name: p.bf_name, samsung_sub: p.samsung_sub ?? null },
      create: p,
    });
    productRecords[p.sbu_code] = { id: prod.id };
  }
  console.log(`     ✓ ${products.length}개 SBU 등록`);

  // ── 3. Users ──────────────────────────────────────────────────────────────
  console.log('  [3/5] Users...');
  const userRecords: { id: string }[] = [];
  for (const u of usersData) {
    const hash = await bcrypt.hash(u.password, 10);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, name_en: u.name_en, role: u.role },
      create: { email: u.email, name: u.name, name_en: u.name_en, role: u.role, password: hash },
    });
    userRecords.push({ id: user.id });
  }
  // AM users start at index 2
  const amUsers = userRecords.slice(2);
  console.log(`     ✓ ${usersData.length}명 User 등록`);

  // ── 4. Customers ──────────────────────────────────────────────────────────
  console.log('  [4/5] Customers (30개 EB)...');
  const customerRecords: Array<{ id: string; tier: string }> = [];
  for (const c of customersData) {
    const ownerId = amUsers[c.am_index]?.id ?? amUsers[0].id;
    const { am_index, ...rest } = c;
    const cust = await prisma.customer.upsert({
      where: { sold_to_code: rest.sold_to_code },
      update: { name: rest.name, tier: rest.tier, lifecycle_stage: rest.lifecycle_stage, owner_id: ownerId },
      create: { ...rest, owner_id: ownerId },
    });
    customerRecords.push({ id: cust.id, tier: cust.tier });
  }
  console.log(`     ✓ ${customersData.length}개 Customer 등록`);

  // ── 5. Mock Actuals (2024년) ───────────────────────────────────────────────
  console.log('  [5/5] Mock Actuals 2024...');
  let actualCount = 0;

  for (const cr of customerRecords) {
    const tierKey = cr.tier as keyof typeof tierBaseKRW;
    const base = tierBaseKRW[tierKey] ?? 10_000;
    const sbuCodes = tierSBUs[tierKey] ?? tierSBUs.C;

    for (const sbuCode of sbuCodes) {
      const prod = productRecords[sbuCode];
      if (!prod) continue;

      const weight = sbuWeights[sbuCode] ?? 1.0;

      // Tier C 고객은 일부 분기만 구매 (sparse)
      const activeQuarters = tierKey === 'C'
        ? [1, 3].filter(() => Math.random() > 0.4)
        : [1, 2, 3, 4];

      for (const q of activeQuarters) {
        const seasonFactor = seasonality[q - 1];
        const randomFactor = rnd(0.7, 1.3);
        const amount = Math.round(base * weight * seasonFactor * randomFactor);

        await prisma.actual.upsert({
          where: {
            customer_id_product_id_year_quarter_source: {
              customer_id: cr.id,
              product_id: prod.id,
              year: 2024,
              quarter: q,
              source: 'Manual', // BIS ETL 미구성 상태에서 수동 입력
            },
          },
          update: { amount_krw: amount },
          create: {
            customer_id: cr.id,
            product_id: prod.id,
            year: 2024,
            quarter: q,
            amount_krw: amount,
            source: 'Manual',
          },
        });
        actualCount++;
      }
    }
  }
  console.log(`     ✓ ${actualCount}개 Actual 레코드 생성 (2024 4분기)`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Seed 완료');
  console.log(`   FX Rates     : ${fxRates.length}개`);
  console.log(`   SBU Products : ${products.length}개`);
  console.log(`   Users        : ${usersData.length}명`);
  console.log(`   Customers    : ${customersData.length}개 (A:6 / B:9 / C:15)`);
  console.log(`   Actuals 2024 : ${actualCount}개`);
  console.log('\n📌 다음 단계:');
  console.log('   1) DATABASE_URL을 .env에 설정 후 npx prisma migrate dev --name init');
  console.log('   2) npm run db:seed');
  console.log('   3) npm run db:studio 로 데이터 확인');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
