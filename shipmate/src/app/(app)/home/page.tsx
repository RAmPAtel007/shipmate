'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar, MessageSquare, Upload, Users, Megaphone,
  Clock, Gift, Bell, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Card, CardHeader, CardTitle, Avatar, Badge, LeaveStatusBadge, Button } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { leaveService } from '@/lib/services/leaveService';
import { formatDate, formatBirthdayDisplay, birthdayCountdown } from '@/lib/utils/formatters';
import { announcementService } from '@/lib/services/announcementService';
import type { ShipmateUser, LeaveRequest, Announcement } from '@/lib/types';

export default function HomePage() {
  const { currentUser } = useAuth();
  const { can } = useRole();
  const router = useRouter();

  const [onLeave, setOnLeave] = useState<LeaveRequest[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<Array<ShipmateUser & { daysUntil: number }>>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const today = new Date().toISOString().split('T')[0];
        const [onLeaveData, birthdayData, announcementsData] = await Promise.all([
          leaveService.getApprovedLeavesOnDate(today),
          userService.getUpcomingBirthdays(7),
          announcementService.getLatestAnnouncements(5),
        ]);
        setOnLeave(onLeaveData);
        setUpcomingBirthdays(birthdayData);
        setAnnouncements(announcementsData);

        if (can.viewAllLeaves) {
          const pending = await leaveService.getPendingLeaves();
          setPendingLeaves(pending);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [can.viewAllLeaves]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = currentUser?.name.split(' ')[0] ?? '';
  const todayStr = formatDate(new Date());

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5 pb-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{todayStr} · Today at Shipcube</p>
      </div>

      {/* ── Quick Actions ─────────────────────────────────────────── */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0">
        {[
          { label: 'Apply Leave',  icon: Calendar,    color: 'bg-[#1B2B5E]',  onClick: () => router.push('/leaves?action=apply') },
          { label: 'Open Chat',    icon: MessageSquare, color: 'bg-[#2D4080]', onClick: () => router.push('/chat') },
          { label: 'View People',  icon: Users,       color: 'bg-[#1a6b3a]', onClick: () => router.push('/people') },
          { label: 'Upload Doc',   icon: Upload,      color: 'bg-[#6b3aa0]', onClick: () => router.push('/documents') },
          ...(can.postAnnouncements
            ? [{ label: 'Announce', icon: Megaphone, color: 'bg-[#b45309]', onClick: () => router.push('/announcements') }]
            : []),
        ].map(({ label, icon: Icon, color, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex flex-col items-center gap-2 flex-shrink-0"
          >
            <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center shadow-sm hover:scale-105 transition-transform`}>
              <Icon size={20} className="text-white" />
            </div>
            <span className="text-[10px] text-gray-600 font-medium whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Cards Grid ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* On Leave Today */}
        <Card>
          <CardHeader>
            <CardTitle>On Leave Today</CardTitle>
            <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-2 py-1 rounded-lg">
              <Clock size={12} />
              <span className="text-xs font-medium">{onLeave.length} away</span>
            </div>
          </CardHeader>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full shimmer" />
                  <div className="h-3 w-32 rounded shimmer" />
                </div>
              ))}
            </div>
          ) : onLeave.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">Everyone is in today ✅</p>
          ) : (
            <div className="space-y-2.5">
              {onLeave.slice(0, 5).map(leave => (
                <div key={leave.id} className="flex items-center gap-2.5">
                  <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{leave.employeeName}</p>
                    <p className="text-xs text-gray-400">{leave.type.replace('-', ' ')}</p>
                  </div>
                  <LeaveStatusBadge status={leave.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Pending Approvals — HR/Manager only */}
        {can.approveLeaves && (
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
              {pendingLeaves.length > 0 && (
                <span className="text-xs bg-[#F5C518] text-[#1B2B5E] font-bold px-2 py-0.5 rounded-full">
                  {pendingLeaves.length}
                </span>
              )}
            </CardHeader>
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-12 rounded-lg shimmer" />)}
              </div>
            ) : pendingLeaves.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-600 py-3">
                <CheckCircle2 size={16} />
                <span className="text-sm font-medium">All caught up!</span>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingLeaves.slice(0, 4).map(leave => (
                  <div
                    key={leave.id}
                    className="flex items-center gap-2.5 p-2.5 bg-amber-50 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors"
                    onClick={() => router.push('/leaves?tab=approvals')}
                  >
                    <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{leave.employeeName}</p>
                      <p className="text-xs text-gray-500">{leave.type.replace(/-/g, ' ')} · {leave.startDate}</p>
                    </div>
                  </div>
                ))}
                {pendingLeaves.length > 4 && (
                  <button
                    onClick={() => router.push('/leaves?tab=approvals')}
                    className="text-xs text-[#1B2B5E] font-semibold hover:underline"
                  >
                    +{pendingLeaves.length - 4} more
                  </button>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Upcoming Birthdays */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Birthdays</CardTitle>
            <Gift size={16} className="text-pink-500" />
          </CardHeader>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 rounded-lg shimmer" />)}
            </div>
          ) : upcomingBirthdays.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">No birthdays in the next 7 days</p>
          ) : (
            <div className="space-y-2.5">
              {upcomingBirthdays.map(user => (
                <div key={user.uid} className="flex items-center gap-2.5">
                  <Avatar name={user.name} src={user.photoURL} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
                    <p className="text-xs text-gray-400">
                      {user.birthday ? formatBirthdayDisplay(user.birthday) : ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold ${user.daysUntil === 0 ? 'text-pink-600' : 'text-gray-500'}`}>
                    {user.birthday ? birthdayCountdown(user.birthday.slice(5)) : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Latest Announcements */}
        <Card>
          <CardHeader>
            <CardTitle>Announcements</CardTitle>
            <Bell size={16} className="text-gray-400" />
          </CardHeader>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-10 rounded-lg shimmer" />)}
            </div>
          ) : announcements.length === 0 ? (
            <p className="text-sm text-gray-400 py-3">No announcements yet</p>
          ) : (
            <div className="space-y-3">
              {announcements.map(a => (
                <div key={a.id} className="flex gap-2.5">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    {a.isPinned ? (
                      <span className="text-amber-500 text-sm">📌</span>
                    ) : (
                      <Bell size={14} className="text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{a.title}</p>
                    <p className="text-xs text-gray-400 truncate">{a.body}</p>
                    <p className="text-[11px] text-gray-300 mt-0.5">{formatDate(a.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

    