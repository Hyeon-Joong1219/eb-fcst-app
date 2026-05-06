'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Users, BarChart3, TrendingUp,
  Settings, ChevronRight, DollarSign, History, Lock,
  FileSpreadsheet, LogOut, ShieldCheck, Pencil, Eye,
} from 'lucide-react';

const nav = [
  { href: '/dashboard',        label: '대시보드',  icon: LayoutDashboard,  exact: false },
  { href: '/customers',        label: '고객 관리', icon: Users,            exact: false },
  { href: '/forecast/history', label: 'FCST 이력', icon: History,          exact: false },
  { href: '/forecast',         label: 'FCST 입력', icon: BarChart3,        exact: true  },
  { href: '/ro',               label: 'R&O',       icon: TrendingUp,       exact: false },
  { href: '/report',           label: '리포트',    icon: FileSpreadsheet,  exact: false },
];

const adminNav = [
  { href: '/admin/fx',        label: 'FX 환율 설정',    icon: DollarSign },
  { href: '/admin/snapshots', label: '스냅샷 잠금 관리', icon: Lock       },
  { href: '/admin/users',     label: '사용자 관리',      icon: Users      },
  { href: '/admin',           label: '시스템 설정',      icon: Settings   },
];

const ROLE_LABEL: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  ADMIN:  { label: '관리자',   color: 'text-red-400',    icon: ShieldCheck },
  EDITOR: { label: '편집자',   color: 'text-blue-400',   icon: Pencil      },
  VIEWER: { label: '조회자',   color: 'text-slate-400',  icon: Eye         },
};

interface Props { role?: string; userName?: string; }

export default function Sidebar({ role, userName }: Props) {
  const pathname  = usePathname();
  const router    = useRouter();
  const roleInfo  = ROLE_LABEL[role ?? ''] ?? { label: role ?? '', color: 'text-slate-400', icon: Eye };
  const RoleIcon  = roleInfo.icon;

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push('/login');
  }

  return (
    <aside className="w-60 min-h-screen bg-slate-900 flex flex-col">
      {/* 로고 */}
      <div className="px-5 py-5 border-b border-slate-700">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Merck Life Science</p>
        <h1 className="text-white font-bold text-lg leading-tight mt-0.5">EB FCST App</h1>
      </div>

      {/* 메인 네비 */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-merck-blue text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800',
              )}
            >
              <Icon size={16} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto" />}
            </Link>
          );
        })}

        {/* Admin 전용 메뉴 */}
        {role === 'ADMIN' && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest">관리자</p>
            </div>
            {adminNav.map(({ href, label, icon: Icon }) => {
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                    active
                      ? 'bg-merck-blue text-white'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800',
                  )}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* 사용자 정보 + 로그아웃 */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
            <RoleIcon size={14} className={roleInfo.color} />
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{userName ?? '사용자'}</p>
            <p className={cn('text-xs mt-0.5', roleInfo.color)}>{roleInfo.label}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                     text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <LogOut size={14} />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
