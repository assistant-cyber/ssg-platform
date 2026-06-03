'use client';
import { Suspense, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getToken, setAuth } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/api';

const AUTO_LOGIN_CODE = '0000';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loginAttempted = useRef(false);

  useEffect(() => {
    if (getToken()) return;
    if (loginAttempted.current) return;
    loginAttempted.current = true;
    api.login(AUTO_LOGIN_CODE)
      .then((res) => {
        api.setToken(res.access_token);
        setAuth(res.access_token, { user_id: res.user_id, name: res.name, role: res.role });
      })
      .catch(() => {});
  }, [pathname]);

  return (
    <div className="ssg-shell flex min-h-screen bg-ssg-lighter">
      <Suspense fallback={<aside className="hidden min-h-screen w-72 shrink-0 border-r border-black/5 bg-[#f3efe7] md:flex" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
