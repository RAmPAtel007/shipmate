'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar, MessageSquare, Users, Megaphone,
  Clock, Gift, Bell, CheckCircle2, ArrowRight,
  FileText, ChevronRight, AlertCircle, Pin,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, LeaveStatusBadge } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { leaveService } from '@/lib/services/leaveService';
import { formatDate, formatBirthdayDisplay, birthdayCountdown, formatRelativeTime, getLeaveTypeLabel } from '@/lib/utils/formatters';
import { announcementService } from '@/lib/services/announcementService';
import type { ShipmateUser, LeaveRequest, Announcement } from '@/lib/types';

// ── Skeleton shimmer ──────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded ${className}`} />;
}

// ── Section card wrapper ──────────────────────────────────────────────────────
function SectionCard({
  title,
  icon,
  badge,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          {icon}
          <h3 className="text-sm font-bold text-gray-800">{title}</h3>
          {badge}
        </div>
        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1 text-xs font-semibold text-[#1B2B5E] hover:text-[#243872] transition-colors"
          >
            {action.label}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function HomePage() {
  const { currentUser } = useAuth();
  const { can } = useRole();
  const router = useRouter();

  const [onLeave, setOnLeave]                         = useState<LeaveRequest[]>([]);
  const [pendingLeaves, setPendingLeaves]             = useState<LeaveRequest[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays]     = useState<Array<ShipmateUser & { daysUntil: number }>>([]);
  const [announcements, setAnnouncements]             = useState<Announcement[]>([]);
  const [loading, setLoading]                         = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    let settled = false;
    const markLoaded = () => { if (!settled) { settled = true; setLoading(false); } };

    // ── Live user subscription for birthdays ─────────────────────────────────
    // Re-computes whenever any user profile changes (name, birthday, etc.)
    const unsubUsers = userService.subscribeToUsers(users => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const upcoming: Array<ShipmateUser & { daysUntil: number }> = [];
      for (const u of users) {
        if (!u.birthday) continue;
        const [, mm, dd] = u.birthday.split('-').map(Number);
        const thisYear = new Date(now.getFullYear(), mm - 1, dd);
        if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
        const diff = Math.round((thisYear.getTime() - now.getTime()) / 86400000);
        if (diff <= 10) upcoming.push({ ...u, daysUntil: diff });
      }
      upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
      setUpcomingBirthdays(upcoming);
      markLoaded();
    });

    const loadAnnouncements = async () => {
      try { const data = await announcementService.getLatestAnnouncements(5); setAnnouncements(data); }
      catch (err) { console.error('[home] announcements:', err); }
    };
    const loadLeaves = async () => {
      try { const data = await leaveService.getApprovedLeavesOnDate(today); setOnLeave(data); }
      catch (err) { console.error('[home] leaves today:', err); }
    };
    const loadPending = async () => {
      if (!can.viewAllLeaves) return;
      try { const data = await leaveService.getPendingLeaves(); setPendingLeaves(data); }
      catch (err) { console.error('[home] pending leaves:', err); }
    };

    Promise.all([loadAnnouncements(), loadLeaves(), loadPending()])
      .finally(markLoaded);

    return () => unsubUsers();
  }, [can.viewAllLeaves]);

  const birthdaysThisWeek = upcomingBirthdays.filter(u => u.daysUntil <= 7);

  const hour      = new Date().getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser?.name.split(' ')[0] ?? '';
  const dayName   = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const QUICK_ACTIONS = [
    { label: 'Chat',        desc: 'Messages & DMs',    icon: MessageSquare, href: '/chat',               iconBg: 'bg-[#1B2B5E]',     iconColor: 'text-white' },
    { label: 'Apply Leave', desc: 'Request time off',  icon: Calendar,      href: '/leaves?action=apply', iconBg: 'bg-emerald-500',   iconColor: 'text-white' },
    { label: 'People',      desc: 'Team directory',    icon: Users,         href: '/people',               iconBg: 'bg-violet-500',    iconColor: 'text-white' },
    { label: 'Documents',   desc: 'Files & folders',   icon: FileText,      href: '/documents',            iconBg: 'bg-orange-500',    iconColor: 'text-white' },
    ...(can.postAnnouncements
      ? [{ label: 'Announce', desc: 'Broadcast message', icon: Megaphone, href: '/announcements', iconBg: 'bg-rose-500', iconColor: 'text-white' }]
      : []),
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50/60">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1B2B5E] via-[#1e3270] to-[#0D1832]">
        {/* Subtle dot grid */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
        {/* Glow orb */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#F5C518]/10 rounded-full blur-[80px] pointer-events-none" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-white/50 text-xs sm:text-sm mb-1">{dayName}, {dateStr}</p>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {greeting}, {firstName} 👋
              </h1>
              <p className="text-white/40 text-xs sm:text-sm mt-1">{"Here's what's happening today."}</p>
            </div>

            {/* Pending approval alert */}
            {can.approveLeaves && !loading && pendingLeaves.length > 0 && (
              <button
                onClick={() => router.push('/leaves?tab=approvals')}
                className="flex-shrink-0 flex items-center gap-1.5 bg-[#F5C518] hover:bg-[#f0bc00] text-[#1B2B5E] text-xs font-bold px-3 py-2 rounded-xl transition-colors shadow-lg"
              >
                <AlertCircle size={12} />
                <span className="hidden sm:inline">{pendingLeaves.length} pending approval{pendingLeaves.length > 1 ? 's' : ''}</span>
                <span className="sm:hidden">{pendingLeaves.length} pending</span>
                <ChevronRight size={11} />
              </button>
            )}
          </div>

          {/* ── Stats strip ─────────────────────────────────────────── */}
          <div className="flex gap-4 sm:gap-6 mt-5 sm:mt-7 pt-5 sm:pt-6 border-t border-white/10 overflow-x-auto no-scrollbar">
            {[
              {
                label: 'Away today',
                value: loading ? '—' : String(onLeave.length),
                dot: onLeave.length > 0 ? 'bg-orange-400' : 'bg-emerald-400',
                sub: loading ? '' : onLeave.length === 0 ? 'Full team in' : `out`,
              },
              ...(can.approveLeaves ? [{
                label: 'Pending',
                value: loading ? '—' : String(pendingLeaves.length),
                dot: pendingLeaves.length > 0 ? 'bg-[#F5C518]' : 'bg-emerald-400',
                sub: loading ? '' : pendingLeaves.length === 0 ? 'All clear' : 'approvals',
              }] : []),
              {
                label: 'Birthdays',
                value: loading ? '—' : String(birthdaysThisWeek.length),
                dot: 'bg-pink-400',
                sub: loading ? '' : birthdaysThisWeek.length === 0 ? 'None this week' : birthdaysThisWeek.map(u => u.name.split(' ')[0]).slice(0,2).join(', '),
              },
            ].map(stat => (
              <div key={stat.label} className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${stat.dot}`} />
                <div>
                  <p className="text-white/40 text-[10px] sm:text-[11px] font-medium uppercase tracking-wider">{stat.label}</p>
                  <p className="text-white font-bold text-base sm:text-lg leading-tight">{stat.value}
                    {stat.sub && <span className="text-white/40 text-xs font-normal ml-1">{stat.sub}</span>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 sm:py-7 space-y-5 sm:space-y-7">

        {/* ── Quick actions ──────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Quick actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
            {QUICK_ACTIONS.map(({ label, desc, icon: Icon, href, iconBg, iconColor }) => (
              <button
                key={label}
                onClick={() => router.push(href)}
                className="group flex items-center gap-3.5 bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-2xl px-4 py-4 text-left transition-all hover:shadow-sm active:scale-[0.98]"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
                  <Icon size={16} className={iconColor} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 leading-tight">{label}</p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Content grid ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* On Leave Today */}
          <SectionCard
            title="On Leave Today"
            icon={<div className="w-7 h-7 bg-orange-50 rounded-lg flex items-center justify-center"><Clock size={14} className="text-orange-500" /></div>}
            badge={!loading && onLeave.length > 0 ? (
              <span className="min-w-[20px] h-5 bg-orange-100 text-orange-600 text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                {onLeave.length}
              </span>
            ) : undefined}
            action={{ label: 'View all', onClick: () => router.push('/leaves') }}
          >
            {loading ? (
              <div className="space-y-3.5">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : onLeave.length === 0 ? (
              <div className="flex items-center gap-3 py-1">
                <div className="w-9 h-9 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Everyone is in today</p>
                  <p className="text-xs text-gray-400">Full team attendance</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {onLeave.slice(0, 5).map(leave => (
                  <div key={leave.id} className="flex items-center gap-3">
                    <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{leave.employeeName}</p>
                      <p className="text-xs text-gray-400">
                        {getLeaveTypeLabel(leave.type)}
                        {leave.startDate !== leave.endDate ? ` · till ${formatDate(leave.endDate)}` : ''}
                      </p>
                    </div>
                    <LeaveStatusBadge status={leave.status} />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Announcements */}
          <SectionCard
            title="Announcements"
            icon={<div className="w-7 h-7 bg-[#1B2B5E]/8 rounded-lg flex items-center justify-center"><Bell size={14} className="text-[#1B2B5E]" /></div>}
            badge={!loading && announcements.length > 0 ? (
              <span className="min-w-[20px] h-5 bg-[#1B2B5E] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                {announcements.length}
              </span>
            ) : undefined}
            action={{ label: 'View all', onClick: () => router.push('/announcements') }}
          >
            {loading ? (
              <div className="space-y-3.5">
                {[1, 2].map(i => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-9 h-9 rounded-xl flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4" />
                      <Skeleton className="h-2.5 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : announcements.length === 0 ? (
              <div className="flex items-center gap-3 py-1">
                <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Bell size={15} className="text-gray-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">No announcements yet</p>
                  <p className="text-xs text-gray-400">Check back later for updates.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {announcements.map(a => (
                  <button
                    key={a.id}
                    onClick={() => router.push('/announcements')}
                    className="w-full flex gap-3 text-left hover:bg-gray-50 rounded-xl p-2 -mx-2 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      a.isPinned ? 'bg-amber-50' : 'bg-[#1B2B5E]/5'
                    }`}>
                      {a.isPinned
                        ? <Pin size={13} className="text-amber-500" />
                        : <Megaphone size={13} className="text-[#1B2B5E]" />
                      }
                    </div>
                    <div className="flex-1 min-w-0 py-0.5">
                      <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                      <p className="text-xs text-gray-400 truncate mt-0.5">{a.body}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Upcoming Birthdays */}
          <SectionCard
            title="Upcoming Birthdays"
            icon={<div className="w-7 h-7 bg-pink-50 rounded-lg flex items-center justify-center"><Gift size={14} className="text-pink-500" /></div>}
            badge={!loading && upcomingBirthdays.length > 0 ? (
              <span className="text-[10px] font-bold text-pink-500 bg-pink-50 px-2 py-0.5 rounded-full">next 10 days</span>
            ) : undefined}
          >
            {loading ? (
              <div className="space-y-3.5">
                {[1, 2].map(i => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : upcomingBirthdays.length === 0 ? (
              <div className="flex items-center gap-3 py-1">
                <div className="w-9 h-9 bg-pink-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <Gift size={15} className="text-pink-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700">No birthdays soon</p>
                  <p className="text-xs text-gray-400">None in the next 10 days</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {upcomingBirthdays.map(user => (
                  <div key={user.uid} className="flex items-center gap-3">
                    <Avatar name={user.name} src={user.photoURL} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.birthday ? formatBirthdayDisplay(user.birthday) : ''}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full ${
                      user.daysUntil === 0
                        ? 'bg-pink-100 text-pink-700'
                        : user.daysUntil <= 3
                        ? 'bg-orange-100 text-orange-600'
                        : user.daysUntil <= 7
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {user.birthday ? birthdayCountdown(user.birthday.slice(5)) : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Pending Approvals — HR/Manager only */}
          {can.approveLeaves && (
            <SectionCard
              title="Pending Approvals"
              icon={<div className="w-7 h-7 bg-amber-50 rounded-lg flex items-center justify-center"><CheckCircle2 size={14} className="text-amber-500" /></div>}
              badge={!loading && pendingLeaves.length > 0 ? (
                <span className="min-w-[20px] h-5 bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                  {pendingLeaves.length}
                </span>
              ) : undefined}
              action={{ label: 'Review', onClick: () => router.push('/leaves?tab=approvals') }}
            >
              {loading ? (
                <div className="space-y-2.5">
                  {[1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
                </div>
              ) : pendingLeaves.length === 0 ? (
                <div className="flex items-center gap-3 py-1">
                  <div className="w-9 h-9 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 size={16} className="text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-700">All caught up!</p>
                    <p className="text-xs text-gray-400">No pending leave requests</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingLeaves.slice(0, 4).map(leave => (
                    <div
                      key={leave.id}
                      className="flex items-center gap-3 p-3 bg-amber-50 hover:bg-amber-100 rounded-xl cursor-pointer transition-colors"
                      onClick={() => router.push('/leaves?tab=approvals')}
                    >
                      <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{leave.employeeName}</p>
                        <p className="text-xs text-gray-500">
                          {leave.type.replace(/-/g, ' ')} · {leave.startDate}
                        </p>
                      </div>
                      <ChevronRight size={14} className="text-gray-400 flex-shrink-0" />
                    </div>
                  ))}
                  {pendingLeaves.length > 4 && (
                    <button
                      onClick={() => router.push('/leaves?tab=approvals')}
                      className="text-xs text-[#1B2B5E] font-bold hover:underline pt-1 block"
                    >
                      +{pendingLeaves.length - 4} more pending
                    </button>
                  )}
                </div>
              )}
            </SectionCard>
          )}

        </div>
      </div>
    </div>
  );
}
