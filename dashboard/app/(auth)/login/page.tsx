'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LoaderCircle } from 'lucide-react';
import BrandWordmark from '@/components/layout/BrandWordmark';
import api from '@/lib/api';
import { clearAuth, getUser, hasDashboardAccess, isAuthenticated, setAuth } from '@/lib/auth';

const TEST_STAFF_PIN = '1111';

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState(TEST_STAFF_PIN);
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
    setLoading(true);
    setError('');

    try {
      const res = await api.login(pin.trim());
      if (!hasDashboardAccess({ user_id: res.user_id, name: res.name, role: res.role })) {
        api.setToken(null);
        clearAuth();
        setError('Staff access is not available right now.');
        return;
      }

      api.setToken(res.access_token);
      setAuth(res.access_token, { user_id: res.user_id, name: res.name, role: res.role });
      router.replace(getNextPath());
    } catch {
      clearAuth();
      api.setToken(null);
      setError('Sign-in failed. Use the current test PIN and try again.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getUser();
      if (hasDashboardAccess(user)) {
        router.replace(getNextPath());
        return;
      }

      clearAuth();
      api.setToken(null);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-ssg-green flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="mb-4 flex justify-center">
            <BrandWordmark compact />
          </div>
          <p className="text-white/75 mt-1 text-sm">Office Dashboard</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ssg-muted">
            Staff Access
          </p>
          <h1 className="mt-3 text-3xl text-ssg-charcoal">Enter dashboard</h1>
          <p className="mt-3 text-sm leading-6 text-ssg-slate">
            This phone test build uses a shared temporary staff PIN.
          </p>

          <form onSubmit={(event) => void handleLogin(event)} className="mt-8 space-y-4 text-left">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-ssg-muted">
                Test PIN
              </span>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <KeyRound size={16} className="text-ssg-muted" />
                <input
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="w-full bg-transparent text-lg tracking-[0.35em] text-ssg-charcoal outline-none"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ssg-green px-5 py-3 text-sm font-semibold text-white transition hover:bg-ssg-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Open Test Workspace'}
            </button>
          </form>

          {error ? <p className="mt-5 text-sm font-medium text-red-600">{error}</p> : null}

          <p className="mt-6 text-sm text-ssg-muted">
            Current test PIN: <span className="font-semibold text-ssg-charcoal">{TEST_STAFF_PIN}</span>
          </p>
          <p className="mt-2 text-xs text-ssg-muted">
            If the page behaved oddly before, reopen this fresh deployment link and sign in once.
          </p>
        </div>
      </div>
    </div>
  );
}
