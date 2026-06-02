'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Camera, FileText, FolderOpen, LogOut, Menu, Settings, Users, X } from 'lucide-react';
import { clearAuth, getUser } from '@/lib/auth';
import clsx from 'clsx';
import BrandWordmark from '@/components/layout/BrandWordmark';

const NAV = [
  { href: '/projects', label: 'Projects', icon: FolderOpen, section: 'projects' },
  { href: '/projects?section=photos', label: 'Photos', icon: Camera, section: 'photos' },
  { href: '/projects?section=reports', label: 'Reports', icon: FileText, section: 'reports' },
  { href: '/projects?section=team', label: 'Team', icon: Users, section: 'team' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setUser(getUser()); }, []);

  const logout = () => { clearAuth(); router.replace('/login'); };

  function SidebarInner({ onClose }: { onClose?: () => void }) {
    return (
      <>
        <div className="border-b border-slate-200 px-5 py-6">
          <div className="flex items-start gap-3">
            <div className="space-y-3">
              <BrandWordmark dark compact />
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="ml-auto rounded-xl p-2 text-ssg-slate/70 transition hover:bg-slate-200 hover:text-ssg-charcoal"
              >
                <X size={20} />
              </button>
            )}
          </div>
        </div>

        <nav className="flex-1 px-4 py-5">
          <div className="space-y-2">
            {NAV.map(({ href, label, icon: Icon, section }) => {
              const active =
                pathname.startsWith('/projects/')
                  ? section === 'projects'
                  : (searchParams.get('section') ?? 'projects') === section;

              return (
                <Link key={href} href={href} onClick={() => onClose?.()}
                  className={clsx(
                    'flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition-all',
                    active
                      ? 'bg-ssg-green text-white shadow-[0_14px_28px_rgba(114,176,52,0.22)]'
                      : 'text-ssg-slate hover:bg-slate-100 hover:text-ssg-charcoal',
                  )}>
                  <Icon size={18} />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-200 px-4 py-4">
          <Link
            href="/projects?section=settings"
            onClick={() => onClose?.()}
            className={clsx(
              'mb-3 flex min-h-11 items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold transition-all',
              (searchParams.get('section') ?? 'projects') === 'settings'
                ? 'bg-ssg-green text-white shadow-[0_14px_28px_rgba(114,176,52,0.22)]'
                : 'text-ssg-slate hover:bg-slate-100 hover:text-ssg-charcoal',
            )}
          >
            <Settings size={18} />
            Settings
          </Link>

          {user && <p className="mb-3 truncate text-xs text-ssg-muted">{user.name}</p>}
          <button onClick={logout}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-ssg-slate transition-colors hover:bg-slate-100 hover:text-ssg-charcoal">
            <LogOut size={16} />Sign out
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Mobile hamburger */}
      <button onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-xl border border-slate-200 bg-white p-2.5 text-ssg-charcoal shadow-sm md:hidden">
        <Menu size={22} />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside className={clsx(
        'fixed bottom-0 left-0 top-0 z-40 flex w-72 flex-col bg-[#eef1f4] transition-transform duration-200 md:hidden',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}>
        <SidebarInner onClose={() => setMobileOpen(false)} />
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden min-h-screen w-72 shrink-0 border-r border-slate-200 bg-[#eef1f4] md:flex md:flex-col">
        <SidebarInner />
      </aside>
    </>
  );
}
