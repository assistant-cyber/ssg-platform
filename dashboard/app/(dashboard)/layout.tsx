'use client';
import { Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { clearAuth, getUser, hasDashboardAccess, isAuthenticated } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const query = typeof window !== 'undefined' ? window.location.search : '';
    const next = query ? `${pathname}${query}` : pathname;
    const loginPath = `/login?next=${encodeURIComponent(next)}`;

    if (!isAuthenticated()) {
      router.replace(loginPath);
      return;
    }

    if (!hasDashboardAccess(getUser())) {
      clearAuth();
      router.replace(loginPath);
    }
  }, [pathname, router]);

  return (
    <div className="ssg-shell flex min-h-screen bg-ssg-lighter">
      <Suspense fallback={<aside className="hidden min-h-screen w-72 shrink-0 border-r border-black/5 bg-[#f3efe7] md:flex" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
