'use client';

import { usePathname } from 'next/navigation';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileNav } from './MobileNav';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import type { ShipmateUser } from '@/lib/types';

interface AppShellProps {
  currentUser: ShipmateUser;
  children: React.ReactNode;
}

export function AppShell({ currentUser, children }: AppShellProps) {
  const pathname = usePathname();
  const activeTab = pathname.split('/')[1] || 'home';
  const { total: unreadCount } = useUnreadCounts();

  return (
    <div className="h-screen flex bg-white overflow-hidden">

      {/* ── Desktop sidebar (md+) ────────────────────────────────── */}
      <div className="hidden md:flex md:flex-shrink-0">
        <DesktopSidebar currentUser={currentUser} activeTab={activeTab} />
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex-shrink-0 bg-[#1B2B5E] flex items-center justify-between px-4 py-3 pt-safe">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#F5C518] rounded-lg flex items-center justify-center">
              <span className="text-[#1B2B5E] text-xs font-bold leading-none">S</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-widest uppercase">
              SHIPMATE
            </span>
          </div>
          {/* User avatar */}
          <div className="w-8 h-8 rounded-full bg-[#2D4080] flex items-center justify-center border-2 border-white/20 overflow-hidden">
            {currentUser.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentUser.photoURL}
                alt={currentUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-white text-xs font-semibold select-none">
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
        </header>

        {/* Page content — each page manages its own scroll */}
        <main className="flex-1 overflow-hidden min-h-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <div className="md:hidden flex-shrink-0">
          <MobileNav currentUser={currentUser} activeTab={activeTab} unreadCount={unreadCount} />
        </div>

      </div>
    </div>
  );
}
