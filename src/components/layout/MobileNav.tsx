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

  // Build visible tabs: defaults + granted optional tabs (no cap — scrollable)
  const visibleTabs = ALL_TABS.filter(({ key }) => {
    if (isAdmin) return true;
    if (DEFAULT_MOBILE_KEYS.includes(key)) return true;
    return currentUser.tabAccess?.[key as TabKey] === true;
  });

  // When there are 6 or fewer tabs they stretch to fill the bar (current behaviour).
  // When there are more, each tab gets a fixed width so they scroll naturally.
  const scrollable = visibleTabs.length > 5;

  return (
    <nav className="bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe">
      <div
        className={`flex items-stretch ${scrollable ? 'overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden' : ''}`}
      >
        {visibleTabs.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;
          const badge = key === 'chat' && unreadCount > 0 ? unreadCount : 0;

          return (
            <Link
              key={key}
              href={href}
              className={`${scrollable ? 'flex-shrink-0 w-16' : 'flex-1'} flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors min-h-[60px] ${
                isActive ? 'text-[#1B2B5E]' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}
                />
                {badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold leading-tight text-center ${isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}`}>
                {label}
              </span>
              {isActive && (
                <div className="w-4 h-0.5 bg-[#F5C518] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
