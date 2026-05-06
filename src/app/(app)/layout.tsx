import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect('/login');

  const role = (session.user as { role?: string }).role;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar role={role} userName={session.user?.name ?? ''} />
      <div className="flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}
