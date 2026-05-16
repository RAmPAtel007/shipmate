'use client';

import Link from 'next/link';
import { Home, MessageSquare, Clock, Calendar, Megaphone } from 'lucide-react';
import type { ShipmateUser } from '@/lib/types';

const TABS = [
  { icon: Home,          label: 'Home',          href: '/home',          key: 'home' },
  { icon: MessageSquare, label: 'Chat',           href: '/chat',          key: 'chat' },
  { icon: Clock,         label: 'Attendance',     href: '/attendance',    key: 'attendance' },
  { icon: Calendar,      label: 'Leaves',         href: '/leaves',        key: 'leaves' },
  { icon: Megaphone,     label: 'Updates',        href: '/announcements', key: 'announcements' },
] as const;

interface Props {
  currentUser: ShipmateUser;
  activeTab: string;
  unreadCount?: number;
  unreadAnnouncements?: number;
}

export function MobileNav({
  currentUser: _currentUser,
  activeTab,
  unreadCount = 0,
  unreadAnnouncements = 0,
}: Props) {
  return (
    <nav className="bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe">
      <div className="flex items-stretch">
        {TABS.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;

          const badge =
            key === 'chat' && unreadCount > 0 ? unreadCount :
            key === 'announcements' && unreadAnnouncements > 0 ? unreadAnnouncements :
            0;

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
