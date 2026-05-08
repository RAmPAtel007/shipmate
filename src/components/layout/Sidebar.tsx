'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  MessageSquare,
  Calendar,
  Users,
  FileText,
  BarChart3,
  Home,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const navigation = [
  { name: 'Home', href: '/home', icon: Home },
  { name: 'Chat', href: '/chat', icon: MessageSquare },
  { name: 'Leaves', href: '/leaves', icon: Calendar },
  { name: 'People', href: '/people', icon: Users },
  { name: 'Documents', href: '/documents', icon: FileText },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-64 bg-navy text-white h-screen fixed left-0 top-0">
      <div className="p-6 border-b border-navy-light">
        <h1 className="text-2xl font-bold text-yellow">SHIPMATE</h1>
        <p className="text-xs text-navy-light mt-1">Shipcube OS</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        {navigation.map(item => {
          const Icon = item.icon;
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors mb-1',
                isActive
                  ? 'bg-yellow text-navy'
                  : 'text-navy-light hover:bg-navy-light hover:text-white'
              )}
            >
              <Icon size={20} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-navy-light">
        <div className="text-xs text-navy-light text-center">
          <p>Version 1.0.0</p>
          <p>Powered by Firebase</p>
        </div>
      </div>
    </aside>
  );
}
