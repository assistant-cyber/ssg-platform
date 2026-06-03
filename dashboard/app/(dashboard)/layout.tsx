import { Suspense } from 'react';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ssg-shell flex min-h-screen bg-ssg-lighter">
      <Suspense fallback={<aside className="hidden min-h-screen w-72 shrink-0 border-r border-black/5 bg-[#f3efe7] md:flex" />}>
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
