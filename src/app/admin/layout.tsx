'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Calendar, MessageSquare,
  MessageCircle, Megaphone, LogOut, Shield, Settings, FolderOpen,
  DollarSign, Clock, Menu, X, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useUnreadAnnouncements } from '@/hooks/useUnreadAnnouncements';

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',     href: '/admin',                key: 'dashboard' },
  { icon: Users,           label: 'Users',          href: '/admin/users',          key: 'users' },
  { icon: Clock,           label: 'Attendance',     href: '/admin/attendance',     key: 'attendance' },
  { icon: Calendar,        label: 'Leaves',         href: '/admin/leaves',         key: 'leaves' },
  { icon: DollarSign,      label: 'Payroll',        href: '/admin/payroll',        key: 'payroll' },
  { icon: MessageCircle,   label: 'Chat',           href: '/admin/chat',           key: 'chat' },
  { icon: MessageSquare,   label: 'Channels',       href: '/admin/channels',       key: 'channels' },
  { icon: Megaphone,       label: 'Announcements',  href: '/admin/announcements',  key: 'announcements' },
  { icon: CalendarDays,    label: 'Holidays',       href: '/admin/holidays',       key: 'holidays' },
  { icon: FolderOpen,      label: 'Documents',      href: '/admin/documents',      key: 'documents' },
  { icon: Settings,        label: 'Settings',       href: '/admin/settings',       key: 'settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live notification counts
  const { total: unreadChat } = useUnreadCounts();
  const unreadAnnouncements = useUnreadAnnouncements();

  // Close sidebar on route change
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (!loading && currentUser && !['super_admin', 'hr_admin'].includes(currentUser.role)) {
      router.replace('/home');
    }
    if (!loading && !currentUser) {
      router.replace('/login');
    }
  }, [currentUser, loading, router]);

  async function handleSignOut() {
    await signOutUser();
    router.replace('/login');
  }

  if (loading || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!['super_admin', 'hr_admin'].includes(currentUser.role)) return null;

  function getBadge(key: string): number {
    if (key === 'chat') return unreadChat;
    if (key === 'announcements') return unreadAnnouncements;
    return 0;
  }

  // Sidebar content (shared between desktop and mobile drawer)
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-5 brightness-0 invert opacity-90 flex-shrink-0"
          />
          <div className="w-px h-4 bg-white/20 flex-shrink-0" />
          <div className="flex flex-col">
            <span className="text-white font-black text-sm tracking-tight leading-none">Shipmate</span>
            <span className="text-[#F5C518]/60 text-[7.5px] font-medium tracking-wide mt-0.5">Admin Panel</span>
          </div>
        </div>
        {/* Close button (mobile only) */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden w-7 h-7 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* User */}
      <div className="px-3 py-2.5 border-b border-white/8 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#F5C518]/20 border border-[#F5C518]/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentUser.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.photoURL} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-[#F5C518] text-[10px] font-bold">
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{currentUser.name}</p>
            <p className="text-[#F5C518]/70 text-[10px] truncate capitalize">{currentUser.role.replace('_', ' ')}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto min-h-0">
        {NAV.map(({ icon: Icon, label, href, key }) => {
          const isActive = href === '/admin'
            ? pathname === '/admin'
            : pathname === href || pathname.startsWith(href + '/');
          const badge = getBadge(key);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all relative ${
                isActive
                  ? 'bg-[#F5C518]/12 text-[#F5C518]'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#F5C518] rounded-r-full" />
              )}
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge > 0 && (
                <span className="min-w-[18px] h-[18px] bg-[#F5C518] text-gray-900 text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Sign Out */}
      <div className="px-2 py-2.5 border-t border-white/8 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-all w-full"
        >
          <LogOut size={15} />
          Sign Out
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* ── Desktop sidebar (md+) ───────────────────────────────── */}
      <aside className="hidden md:flex w-56 bg-gray-950 flex-col flex-shrink-0 h-full min-h-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────── */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-64 bg-gray-950 flex flex-col z-50 md:hidden shadow-2xl min-h-0">
            <SidebarContent />
          </aside>
        </>
      )}

      {/* ── Main ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Mobile top bar */}
        <header className="md:hidden flex-shrink-0 bg-gray-950 flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
            {/* Dot on hamburger when there are unread items on mobile */}
            {(unreadChat > 0 || unreadAnnouncements > 0) && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#F5C518] rounded-full" />
            )}
          </button>
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-[#F5C518]" strokeWidth={2.5} />
            <span className="text-white font-black text-base tracking-tight">Shipmate Admin</span>
          </div>
          <div className="w-9" />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}
