/**
 * 사용자 시드 스크립트
 * 실행: npx tsx prisma/seed-users.ts
 *
 * 계정 정보:
 *   Admin  : admin@eb.local  / Admin@2025!
 *   Editor : editor@eb.local / Editor@2025!
 *   Viewer : viewer@eb.local / Viewer@2025!
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const users = [
    {
      email:    'admin',
      name:     '관리자',
      name_en:  'Admin',
      role:     'ADMIN' as const,
      password: 'admin1234',
    },
    {
      email:    'merck_editor',
      name:     '편집자',
      name_en:  'Editor',
      role:     'EDITOR' as const,
      password: 'editor2026@',
    },
    {
      email:    'merck_viewer',
      name:     '조회자',
      name_en:  'Viewer',
      role:     'VIEWER' as const,
      password: 'viewer2026@',
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 12);
    await prisma.user.upsert({
      where:  { email: u.email },
      update: { name: u.name, name_en: u.name_en, role: u.role as any, password: hash, is_active: true },
      create: { email: u.email, name: u.name, name_en: u.name_en, role: u.role as any, password: hash, is_active: true },
    });
    console.log(`✅  ${u.role.padEnd(6)} — ${u.email}  (pw: ${u.password})`);
  }

  console.log('\n사용자 생성 완료!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
