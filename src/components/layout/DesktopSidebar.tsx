'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home, MessageSquare, Calendar, Users,
  FolderOpen, Settings, LogOut, Megaphone, Shield,
  Clock, Receipt,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getDepartmentLabel } from '@/lib/utils/formatters';
import type { ShipmateUser } from '@/lib/types';

const NAV_ITEMS = [
  { icon: Home,          label: 'Dashboard',     href: '/home',          key: 'home' },
  { icon: MessageSquare, label: 'Chat',           href: '/chat',          key: 'chat' },
  { icon: Clock,         label: 'Attendance',     href: '/attendance',    key: 'attendance' },
  { icon: Calendar,      label: 'Leaves',         href: '/leaves',        key: 'leaves' },
  { icon: Receipt,       label: 'Payslip',        href: '/payslip',       key: 'payslip' },
  { icon: Users,         label: 'People',         href: '/people',        key: 'people' },
  { icon: FolderOpen,    label: 'Documents',      href: '/documents',     key: 'documents' },
  { icon: Megaphone,     label: 'Announcements',  href: '/announcements', key: 'announcements' },
  { icon: Settings,      label: 'Settings',       href: '/settings',      key: 'settings' },
] as const;

interface Props {
  currentUser: ShipmateUser;
  activeTab: string;
  unreadCount?: number;
  unreadAnnouncements?: number;
}

export function DesktopSidebar({
  currentUser,
  activeTab,
  unreadCount = 0,
  unreadAnnouncements = 0,
}: Props) {
  const { signOutUser } = useAuth();
  const router = useRouter();
  const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);
  const initials = currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  async function handleSignOut() {
    await signOutUser();
    router.replace('/login');
  }

  return (
    <aside className="w-[220px] h-full bg-[#1B2B5E] flex flex-col select-none">

      {/* ── Workspace header ──────────────────────────────────────── */}
      <div className="px-3 py-3.5 border-b border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-1 py-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-5 brightness-0 invert opacity-90 flex-shrink-0"
          />
          <div className="w-px h-4 bg-white/20 flex-shrink-0" />
          <div className="flex flex-col">
            <span className="text-white font-black text-[17px] tracking-tight leading-none">Shipmate</span>
            <span className="text-[#F5C518]/60 text-[8px] font-semibold tracking-[0.08em] uppercase mt-0.5">
              powered by Shipcube Ai
            </span>
          </div>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;

          // Badge count per nav item
          const badge =
            key === 'chat' && unreadCount > 0 ? unreadCount :
            key === 'announcements' && unreadAnnouncements > 0 ? unreadAnnouncements :
            0;

          return (
            <Link
              key={key}
              href={href}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all group relative ${
                isActive
                  ? 'bg-white/20 text-white'
                  : 'text-[#bcc4d4] hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon
                size={17}
                className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-[#8d9cb8] group-hover:text-white'}`}
                strokeWidth={isActive ? 2.5 : 2}
              />
              <span className="flex-1 truncate">{label}</span>
              {badge > 0 && (
                <span className="min-w-[18px] h-[18px] bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Admin Panel */}
        {isAdmin && (
          <Link
            href="/admin"
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all group relative ${
              activeTab === 'admin'
                ? 'bg-white/20 text-white'
                : 'text-[#bcc4d4] hover:bg-white/10 hover:text-white'
            }`}
          >
            <Shield
              size={17}
              className={`flex-shrink-0 ${activeTab === 'admin' ? 'text-white' : 'text-[#8d9cb8] group-hover:text-white'}`}
              strokeWidth={activeTab === 'admin' ? 2.5 : 2}
            />
            <span>Admin Panel</span>
          </Link>
        )}
      </nav>

      {/* ── User profile ─────────────────────────────────────────── */}
      <div className="px-2 py-2 border-t border-white/10 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer group">
          <div className="relative flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-[#2D4080] flex items-center justify-center overflow-hidden border-2 border-white/20">
              {currentUser.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="text-white text-xs font-bold">{initials}</span>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-400 border-2 border-[#1B2B5E] rounded-full" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold truncate leading-tight">{currentUser.name}</p>
            <p className="text-[#8d9cb8] text-[11px] truncate leading-tight">
              {getDepartmentLabel(currentUser.department)}
            </p>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="p-1 rounded text-[#8d9cb8] hover:text-white transition-colors opacity-0 group-hover:opacity-100"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

    </aside>
  );
}
