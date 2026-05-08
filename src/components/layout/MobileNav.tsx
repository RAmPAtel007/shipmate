'use client';

import Link from 'next/link';
import { Home, MessageSquare, Calendar, Users, MoreHorizontal } from 'lucide-react';
import type { ShipmateUser } from '@/lib/types';

const TABS = [
  { icon: Home,            label: 'Home',   href: '/home',     key: 'home' },
  { icon: MessageSquare,   label: 'Chat',   href: '/chat',     key: 'chat' },
  { icon: Calendar,        label: 'Leaves', href: '/leaves',   key: 'leaves' },
  { icon: Users,           label: 'People', href: '/people',   key: 'people' },
  { icon: MoreHorizontal,  label: 'More',   href: '/settings', key: 'settings' },
] as const;

interface Props {
  currentUser: ShipmateUser;
  activeTab: string;
  unreadCount?: number;
}

export function MobileNav({ currentUser, activeTab, unreadCount = 0 }: Props) {
  return (
    <nav className="bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-safe">
      <div className="flex items-stretch">
        {TABS.map(({ icon: Icon, label, href, key }) => {
          const isActive = activeTab === key;
          const showBadge = key === 'chat' && unreadCount > 0;

          return (
            <Link
              key={key}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 px-1 transition-colors min-h-[52px] ${
                isActive ? 'text-[#1B2B5E]' : 'text-gray-400 active:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  className={isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-[#F5C518] text-[#1B2B5E] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium leading-tight ${isActive ? 'text-[#1B2B5E]' : 'text-gray-400'}`}>
                {label}
              </span>
              {/* Active underline dot */}
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
