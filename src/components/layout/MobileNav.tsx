'use client';

import Link from 'next/link';
import { Home, MessageSquare, Clock, Calendar, CalendarDays, FolderOpen, Users, Receipt, Settings } from 'lucide-react';
import type { ShipmateUser, TabKey } from '@/lib/types';

// Always visible on mobile
const DEFAULT_MOBILE_KEYS = ['home', 'attendance', 'calendar', 'leaves', 'settings'];

const ALL_TABS = [
  { icon: Home,          label: 'Home',       href: '/home',       key: 'home' },
  { icon: MessageSquare, label: 'Chat',        href: '/chat',       key: 'chat' },
  { icon: Clock,         label: 'Attendance', href: '/attendance', key: 'attendance' },
  { icon: Calendar,      label: 'Leaves',     href: '/leaves',     key: 'leaves' },
  { icon: CalendarDays,  label: 'Calendar',   href: '/calendar',   key: 'calendar' },
  { icon: Receipt,       label: 'Payslip',    href: '/payslip',    key: 'payslip' },
  { icon: Users,         label: 'People',     href: '/people',     key: 'people' },
  { icon: FolderOpen,    label: 'Documents',  href: '/documents',  key: 'documents' },
  { icon: Settings,      label: 'Settings',   href: '/settings',   key: 'settings' },
];

interface Props {
  currentUser: ShipmateUser;
  activeTab: string;
  unreadCount?: number;
}

export function MobileNav({
  currentUser,
  activeTab,
  unreadCount = 0,
}: Props) {
  const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);

  // Build visible tabs: defaults + granted optional tabs, capped at 6 for mobile
  const visibleTabs = ALL_TABS.filter(({ key }) => {
    if (isAdmin) return true;
    if (DEFAULT_MOBILE_KEYS.includes(key)) return true;
    return currentUser.tabAccess?.[key as TabKey] === true;
  }).slice(0, 6);

  return (
    <nav className="bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe">
      <div className="flex items-stretch">
        {visibleTabs.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;
          const badge = key === 'chat' && unreadCount > 0 ? unreadCount : 0;

          return (
            <Link
              key={key}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors min-h-[60px] ${
                isActive ? 'text-[#1B2B5E]' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon
                  size={25}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}
                />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-semibold leading-tight ${isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}`}>
                {label}
              </span>
              {isActive && (
                <div className="w-5 h-0.5 bg-[#F5C518] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
