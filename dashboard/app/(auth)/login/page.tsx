'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, LoaderCircle } from 'lucide-react';
import BrandWordmark from '@/components/layout/BrandWordmark';
import api from '@/lib/api';
import { clearAuth, getUser, hasDashboardAccess, isAuthenticated, setAuth } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
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
    if (!password.trim()) { setError('Please enter your password.'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.login(password.trim());
      if (!hasDashboardAccess({ user_id: res.user_id, name: res.name, role: res.role })) {
        api.setToken(null); clearAuth(); setError('This account does not have staff access.'); return;
      }
      api.setToken(res.access_token);
      setAuth(res.access_token, { user_id: res.user_id, name: res.name, role: res.role });
      router.replace(getNextPath());
    } catch { clearAuth(); api.setToken(null); setError('Incorrect password. Please try again.'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (isAuthenticated()) {
      const user = getUser();
      if (hasDashboardAccess(user)) { router.replace(getNextPath()); return; }
      clearAuth(); api.setToken(null);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-ssg-green flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="mb-4 flex justify-center"><BrandWordmark compact /></div>
          <p className="text-white/75 mt-1 text-sm">Field Inspection Platform</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-2xl font-semibold text-ssg-charcoal text-center">Sign in</h1>
          <p className="mt-2 text-sm text-center text-ssg-muted">Staff access only</p>
          <form onSubmit={(event) => void handleLogin(event)} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ssg-charcoal">Password</span>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 focus-within:border-ssg-green">
                <Lock size={16} className="text-ssg-muted shrink-0" />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete="current-password" autoFocus className="w-full bg-transparent text-base text-ssg-charcoal outline-none placeholder:text-ssg-muted/60" />
              </div>
            </label>
            <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ssg-green px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-ssg-dark disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          {error ? <p className="mt-4 text-sm font-medium text-red-600 text-center">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
