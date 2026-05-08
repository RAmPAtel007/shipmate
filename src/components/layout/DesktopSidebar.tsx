'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home, MessageSquare, Calendar, Users,
  FolderOpen, Settings, LogOut, Megaphone,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getDepartmentLabel } from '@/lib/utils/formatters';
import type { ShipmateUser } from '@/lib/types';

const NAV_ITEMS = [
  { icon: Home,          label: 'Dashboard',     href: '/home',          key: 'home' },
  { icon: MessageSquare, label: 'Chat',           href: '/chat',          key: 'chat' },
  { icon: Calendar,      label: 'Leaves',         href: '/leaves',        key: 'leaves' },
  { icon: Users,         label: 'People',         href: '/people',        key: 'people' },
  { icon: FolderOpen,    label: 'Documents',      href: '/documents',     key: 'documents' },
  { icon: Megaphone,     label: 'Announcements',  href: '/announcements', key: 'announcements' },
] as const;

interface Props {
  currentUser: ShipmateUser;
  activeTab: string;
  unreadCount?: number;
}

export function DesktopSidebar({ currentUser, activeTab, unreadCount = 0 }: Props) {
  const { signOutUser } = useAuth();
  const router = useRouter();
  const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);

  async function handleSignOut() {
    await signOutUser();
    router.replace('/login');
  }

  return (
    <aside className="w-60 h-full bg-[#1B2B5E] flex flex-col select-none">

      {/* Logo ────────────────────────────────────────────────────── */}
      <div className="px-5 py-5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#F5C518] rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <span className="text-[#1B2B5E] font-bold text-lg leading-none">S</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-bold text-[15px] tracking-widest uppercase">SHIPMATE</h1>
            <p className="text-white/35 text-[9px] uppercase tracking-widest font-medium">Shipcube</p>
          </div>
        </div>
      </div>

      {/* User card ───────────────────────────────────────────────── */}
      <div className="px-4 py-3.5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#2D4080] flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-white/15">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-white text-xs font-semibold">
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-snug">
              {currentUser.name}
            </p>
            <p className="text-white/45 text-[11px] truncate leading-snug">
              {getDepartmentLabel(currentUser.department)}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation ──────────────────────────────────────────────── */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;
          const showBadge = key === 'chat' && unreadCount > 0;

          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-100 group relative ${
                isActive
                  ? 'bg-white/13 text-white'
                  : 'text-white/60 hover:bg-white/7 hover:text-white/90'
              }`}
            >
              {/* Active indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#F5C518] rounded-r-full" />
              )}
              <Icon
                size={17}
                className={`flex-shrink-0 ${isActive ? 'text-[#F5C518]' : 'text-white/50 group-hover:text-white/70'}`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="flex-1">{label}</span>
              {showBadge && (
                <span className="min-w-[18px] h-[18px] bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          );
        })}

        {/* Admin-only: Settings */}
        {isAdmin && (
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13.5px] font-medium transition-all duration-100 group relative ${
              activeTab === 'settings'
                ? 'bg-white/13 text-white'
                : 'text-white/60 hover:bg-white/7 hover:text-white/90'
            }`}
          >
            {activeTab === 'settings' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[#F5C518] rounded-r-full" />
            )}
            <Settings
              size={17}
              className={`flex-shrink-0 ${activeTab === 'settings' ? 'text-[#F5C518]' : 'text-white/50 group-hover:text-white/70'}`}
              strokeWidth={activeTab === 'settings' ? 2.5 : 2}
            />
            Settings
          </Link>
        )}
      </nav>

      {/* Sign out ────────────────────────────────────────────────── */}
      <div className="px-3 py-3 border-t border-white/10 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/45 hover:text-white/80 hover:bg-white/7 text-[13px] font-medium transition-all w-full"
        >
          <LogOut size={16} className="flex-shrink-0" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
