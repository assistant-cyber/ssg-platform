'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getToken, setAuth } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';
import api from '@/lib/api';

const AUTO_LOGIN_CODE = '0000';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const loginAttempted = useRef(false);
  const [authReady, setAuthReady] = useState<boolean>(() => Boolean(getToken()));
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      setAuthReady(true);
      setAuthError(null);
      return;
    }

    if (loginAttempted.current) return;
    loginAttempted.current = true;
    setAuthReady(false);
    setAuthError(null);

    api.login(AUTO_LOGIN_CODE)
      .then((res) => {
        api.setToken(res.access_token);
        setAuth(res.access_token, { user_id: res.user_id, name: res.name, role: res.role });
        setAuthReady(true);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Unable to sign in to the dashboard.';
        setAuthError(message);
      });
  }, [pathname]);

  if (!authReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ssg-lighter px-6">
        <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
            Dashboard
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-ssg-charcoal">
            {authError ? 'Sign-in failed' : 'Connecting to workspace'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-ssg-slate">
            {authError
              ? authError
              : 'Authenticating before loading projects so the app does not bounce between routes.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ssg-shell flex min-h-screen bg-ssg-lighter">
      <Suspense fallback={<aside className="hidden min-h-screen w-72 shrink-0 border-r border-black/5 bg-[#f3efe7] md:flex" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
