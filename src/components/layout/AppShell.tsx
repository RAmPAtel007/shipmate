'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, Settings, LogOut, Shield, X, ChevronRight, Megaphone, BellRing } from 'lucide-react';
import Link from 'next/link';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileNav } from './MobileNav';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useAuth } from '@/contexts/AuthContext';
import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateUser } from '@/lib/types';

// ── Notification item type ─────────────────────────────────────────────────────

interface NotifItem {
  id: string;
  title: string;
  body: string;
  createdAt: any;
  type: 'announcement' | 'leave';
}

// ── Notification Bell ──────────────────────────────────────────────────────────

function NotificationBell({ currentUser }: { currentUser: ShipmateUser }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const unreadIds = useRef<string[]>([]);

  // Fetch recent announcements as notifications
  useEffect(() => {
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(8));
    const unsub = onSnapshot(q, snap => {
      const notifs: NotifItem[] = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title ?? 'Announcement',
          body: data.body ?? data.content ?? '',
          createdAt: data.createdAt,
          type: 'announcement',
        };
      });
      setItems(notifs);
      // Track which are unread
      const ids = snap.docs
        .filter(d => !(d.data().readBy ?? []).includes(currentUser.uid))
        .map(d => d.id);
      unreadIds.current = ids;
      setUnread(ids.length);
    });
    return () => unsub();
  }, [currentUser.uid]);

  // Mark all visible notifications as read when the panel opens
  async function markAllRead() {
    const ids = unreadIds.current;
    if (ids.length === 0) return;
    await Promise.all(
      ids.map(id =>
        updateDoc(doc(db, 'announcements', id), {
          readBy: arrayUnion(currentUser.uid),
        })
      )
    );
    // onSnapshot fires automatically — unread count drops to 0
  }

  function handleOpen() {
    setOpen(o => {
      if (!o) markAllRead(); // mark read when opening
      return !o;
    });
  }

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function timeAgo(ts: any): string {
    if (!ts) return '';
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleOpen}
        className="relative w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
      >
        <Bell size={16} className="text-white" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-[#F5C518] text-[#1B2B5E] text-[9px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-[#1B2B5E]" />
              <span className="text-sm font-bold text-gray-800">Notifications</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold bg-[#1B2B5E] text-white px-1.5 py-0.5 rounded-full">{unread}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>

          {/* Items */}
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {items.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={22} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No notifications yet</p>
              </div>
            ) : (
              items.map(item => (
                <Link
                  key={item.id}
                  href="/announcements"
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#1B2B5E]/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Megaphone size={13} className="text-[#1B2B5E]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{item.title}</p>
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{item.body.slice(0, 60)}{item.body.length > 60 ? '…' : ''}</p>
                    <p className="text-[10px] text-gray-300 mt-1">{timeAgo(item.createdAt)}</p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <Link
              href="/announcements"
              onClick={() => setOpen(false)}
              className="flex items-center justify-center gap-1 text-xs font-semibold text-[#1B2B5E] hover:text-[#2D4080] transition-colors"
            >
              View all <ChevronRight size={11} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Mobile Profile Sheet ───────────────────────────────────────────────────────

function MobileProfileSheet({
  currentUser,
  onClose,
}: {
  currentUser: ShipmateUser;
  onClose: () => void;
}) {
  const { signOutUser } = useAuth();
  const router = useRouter();
  const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);

  async function handleSignOut() {
    onClose();
    await signOutUser();
    router.replace('/login');
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 md:hidden"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white rounded-t-2xl shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Profile info */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-12 h-12 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
            {currentUser.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.photoURL} alt={currentUser.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <span className="text-[#1B2B5E] text-base font-bold">
                {currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 truncate">{currentUser.name}</p>
            <p className="text-xs text-gray-400 truncate">{currentUser.email}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-3 py-3 space-y-1">
          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Settings size={18} className="text-[#1B2B5E]" />
            <span className="text-sm font-semibold text-gray-700">Settings & Profile</span>
            <ChevronRight size={15} className="text-gray-300 ml-auto" />
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <Shield size={18} className="text-violet-600" />
              <span className="text-sm font-semibold text-gray-700">Admin Panel</span>
              <ChevronRight size={15} className="text-gray-300 ml-auto" />
            </Link>
          )}

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 transition-colors w-full text-left"
          >
            <LogOut size={18} className="text-red-500" />
            <span className="text-sm font-semibold text-red-500">Sign Out</span>
          </button>
        </div>

        {/* Safe area spacer */}
        <div className="h-6" />
      </div>
    </>
  );
}

// ── App Shell ──────────────────────────────────────────────────────────────────

import type { NotifPermission } from '@/hooks/usePushNotifications';

interface AppShellProps {
  currentUser: ShipmateUser;
  children: React.ReactNode;
  notifPermission?: NotifPermission;
  onRequestNotifPermission?: () => void;
}

// ── Notification Permission Banner ─────────────────────────────────────────────

function NotifPermissionBanner({ onAllow, onDismiss }: { onAllow: () => void; onDismiss: () => void }) {
  return (
    <div className="flex-shrink-0 bg-[#1B2B5E] border-b border-white/10 px-4 py-2.5 flex items-center gap-3">
      <div className="w-7 h-7 rounded-full bg-[#F5C518]/20 flex items-center justify-center flex-shrink-0">
        <BellRing size={14} className="text-[#F5C518]" />
      </div>
      <p className="flex-1 text-xs text-white/80 leading-snug">
        <span className="font-semibold text-white">Enable notifications</span> to get alerts for announcements, leave updates & messages.
      </p>
      <button
        onClick={onAllow}
        className="flex-shrink-0 bg-[#F5C518] text-[#1B2B5E] text-[11px] font-bold px-3 py-1.5 rounded-lg hover:bg-[#f0bc10] transition-colors"
      >
        Allow
      </button>
      <button onClick={onDismiss} className="text-white/40 hover:text-white/70 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

export function AppShell({ currentUser, children, notifPermission, onRequestNotifPermission }: AppShellProps) {
  const pathname = usePathname();
  const activeTab = pathname.split('/')[1] || 'home';
  const { total: unreadCount } = useUnreadCounts();
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [notifBannerDismissed, setNotifBannerDismissed] = useState(false);

  // Show banner only when permission hasn't been decided yet and user hasn't dismissed it
  const showNotifBanner = !notifBannerDismissed
    && notifPermission === 'default'
    && !!onRequestNotifPermission;

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
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            {/* Icon badge */}
            <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center flex-shrink-0 shadow-inner">
              <span className="text-[#F5C518] font-black text-sm leading-none tracking-tighter">S</span>
            </div>
            {/* Wordmark */}
            <div className="flex flex-col">
              <span className="text-white font-black text-[17px] tracking-tight leading-none">Shipmate</span>
              <span className="text-[#F5C518]/60 text-[8px] font-semibold tracking-[0.08em] uppercase mt-0.5">
                powered by Shipcube Ai
              </span>
            </div>
          </div>

          {/* Right: Bell + Avatar */}
          <div className="flex items-center gap-2">
            <NotificationBell currentUser={currentUser} />

            {/* Avatar → opens settings sheet */}
            <button
              onClick={() => setShowProfileSheet(true)}
              className="w-8 h-8 rounded-full bg-[#2D4080] flex items-center justify-center border-2 border-white/20 overflow-hidden flex-shrink-0"
            >
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
            </button>
          </div>
        </header>

        {/* Notification permission banner */}
        {showNotifBanner && (
          <NotifPermissionBanner
            onAllow={() => { onRequestNotifPermission!(); setNotifBannerDismissed(true); }}
            onDismiss={() => setNotifBannerDismissed(true)}
          />
        )}

        {/* Page content */}
        <main className="flex-1 overflow-hidden min-h-0">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <div className="md:hidden flex-shrink-0">
          <MobileNav currentUser={currentUser} activeTab={activeTab} unreadCount={unreadCount} />
        </div>

      </div>

      {/* Mobile Profile Sheet */}
      {showProfileSheet && (
        <MobileProfileSheet
          currentUser={currentUser}
          onClose={() => setShowProfileSheet(false)}
        />
      )}
    </div>
  );
}
