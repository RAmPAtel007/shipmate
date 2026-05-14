'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Calendar, MessageSquare,
  MessageCircle, Megaphone, LogOut, Shield, Settings, FolderOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard',     href: '/admin' },
  { icon: Users,           label: 'Users',          href: '/admin/users' },
  { icon: Calendar,        label: 'Leaves',         href: '/admin/leaves' },
  { icon: MessageCircle,   label: 'Chat',           href: '/admin/chat' },
  { icon: MessageSquare,   label: 'Channels',       href: '/admin/channels' },
  { icon: Megaphone,       label: 'Announcements',  href: '/admin/announcements' },
  { icon: FolderOpen,      label: 'Documents',      href: '/admin/documents' },
  { icon: Settings,        label: 'Settings',       href: '/admin/settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* Sidebar */}
      <aside className="w-64 bg-gray-950 flex flex-col flex-shrink-0 h-full">

        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="flex flex-col">
              <span className="text-white font-black text-base tracking-tight leading-none">Shipmate</span>
              <span className="text-[#F5C518]/60 text-[8px] font-medium tracking-wide mt-0.5">powered by Shipcube Ai</span>
            </div>
            <div className="w-px h-5 bg-white/20 flex-shrink-0" />
            <div className="flex items-center gap-1.5">
              <Shield size={13} className="text-[#F5C518]" strokeWidth={2.5} />
              <p className="text-white/70 font-semibold text-xs tracking-wider uppercase">Admin</p>
            </div>
          </div>
        </div>

        {/* User */}
        <div className="px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-[#F5C518]/20 border border-[#F5C518]/30 flex items-center justify-center overflow-hidden flex-shrink-0">
              {currentUser.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentUser.photoURL} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="text-[#F5C518] text-xs font-bold">
                  {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{currentUser.name}</p>
              <p className="text-[#F5C518]/70 text-[11px] truncate capitalize">{currentUser.role.replace('_', ' ')}</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ icon: Icon, label, href }) => {
            const isActive = href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all relative ${
                  isActive
                    ? 'bg-[#F5C518]/12 text-[#F5C518]'
                    : 'text-white/50 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#F5C518] rounded-r-full" />}
                <Icon size={18} strokeWidth={isActive ? 2.5 : 2} className="flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign Out */}
        <div className="px-3 py-4 border-t border-white/8">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/70 hover:bg-white/5 transition-all w-full"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-hidden min-h-0">
        {children}
      </main>
    </div>
  );
}
