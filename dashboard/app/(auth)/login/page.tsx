'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LoaderCircle } from 'lucide-react';
import BrandWordmark from '@/components/layout/BrandWordmark';
import api from '@/lib/api';
import { clearAuth, getUser, hasDashboardAccess, isAuthenticated, setAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function getNextPath() {
    if (typeof window === 'undefined') return '/projects';
    const raw = new URLSearchParams(window.location.search).get('next');
    if (!raw || !raw.startsWith('/')) return '/projects';
    return raw;
  }

  async function handleLogin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();

    if (!code.trim()) {
      setError('Enter your staff access code.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await api.login(code.trim());
      const user = { user_id: res.user_id, name: res.name, role: res.role };

      if (!hasDashboardAccess(user)) {
        api.setToken(null);
        clearAuth();
        setError('This account does not have staff access.');
        return;
      }

      api.setToken(res.access_token);
      setAuth(res.access_token, user);
      router.replace(getNextPath());
    } catch {
      clearAuth();
      api.setToken(null);
      setError('Incorrect access code. Try the current staff PIN.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isAuthenticated()) return;

    const user = getUser();
    if (hasDashboardAccess(user)) {
      router.replace(getNextPath());
      return;
    }

    clearAuth();
    api.setToken(null);
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ssg-green p-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mb-4 flex justify-center">
            <BrandWordmark compact />
          </div>
          <p className="mt-1 text-sm text-white/75">Office Dashboard</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl">
          <h1 className="text-center text-2xl font-semibold text-ssg-charcoal">Sign in</h1>
          <p className="mt-2 text-center text-sm text-ssg-muted">Staff access only</p>

          <form onSubmit={(event) => void handleLogin(event)} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ssg-charcoal">Staff access code</span>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-ssg-green">
                <KeyRound size={16} className="shrink-0 text-ssg-muted" />
                <input
                  type="password"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="current-password"
                  autoFocus
                  placeholder="Enter current staff PIN"
                  className="w-full bg-transparent text-base text-ssg-charcoal outline-none placeholder:text-ssg-muted/60"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ssg-green px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-ssg-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          {error ? <p className="mt-4 text-center text-sm font-medium text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
