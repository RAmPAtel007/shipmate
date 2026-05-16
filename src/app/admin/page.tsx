'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Download, Plus, ChevronRight, Check, X,
  CalendarCheck, Gift, TrendingUp, AlertCircle,
} from 'lucide-react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot, updateDoc, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Employee {
  uid: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  photoURL?: string;
  status: string;
  birthday?: string;
  employeeId?: string;
}

interface LeaveRequest {
  id: string;
  userId?: string;
  employeeId?: string;
  employeeName: string;
  employeePhotoURL?: string;
  department?: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  days?: number;
  createdAt: any;
}

interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  punchIn?: any;
  punchOut?: any;
}

interface Announcement {
  id: string;
  title: string;
  content?: string;
  body?: string;
  category?: string;
  createdAt: any;
  postedAt?: any;
}

interface Holiday {
  id: string;
  name: string;
  date: string;
  countries?: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function safeDate(ts: any): Date {
  if (!ts) return new Date(0);
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function getLast6Dates(): string[] {
  const dates: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const dt = new Date(dateStr + 'T12:00:00');
  dt.setHours(12, 0, 0, 0);
  const diff = Math.round((t.getTime() - dt.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

function leaveTypeLabel(type: string): string {
  const m: Record<string, string> = {
    casual: 'Paid leave', paid: 'Paid leave', sick: 'Sick leave',
    unpaid: 'Unpaid leave', wfh: 'Work from home',
    'half-day-first': 'Half day', 'half-day-second': 'Half day',
  };
  return m[type] ?? type.replace(/-/g, ' ');
}

function dateRangeLabel(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  const day = (d: Date) => d.getDate();
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (start === end) return `${day(s)} ${mon(s)}`;
  if (s.getMonth() === e.getMonth()) return `${day(s)} ${mon(s)} – ${day(e)}`;
  return `${day(s)} ${mon(s)} – ${day(e)} ${mon(e)}`;
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + 'T12:00:00');
  const e = new Date(end + 'T12:00:00');
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

function formatAnnouncementDate(ts: any): string {
  const d = safeDate(ts);
  if (d.getTime() === 0) return '';
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function categoryStyle(cat?: string): string {
  switch ((cat ?? '').toLowerCase()) {
    case 'company': return 'bg-[#1B2B5E] text-white';
    case 'policy':  return 'bg-gray-200 text-gray-700';
    case 'hr':      return 'bg-emerald-100 text-emerald-700';
    case 'event':   return 'bg-violet-100 text-violet-700';
    default:        return 'bg-gray-100 text-gray-600';
  }
}

function holDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    day: String(d.getDate()).padStart(2, '0'),
    mon: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
  };
}

// ── Micro-avatar ───────────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#1B2B5E','#059669','#7c3aed','#dc2626','#d97706','#0891b2'];
function Avatar({ name, photo, size = 32 }: { name: string; photo?: string | null; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const bg = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  if (photo) {
    return <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold"
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { currentUser } = useAuth();

  const [employees,      setEmployees]      = useState<Employee[]>([]);
  const [pendingLeaves,  setPendingLeaves]  = useState<LeaveRequest[]>([]);
  const [approvedLeaves, setApprovedLeaves] = useState<LeaveRequest[]>([]);
  const [todayAtt,       setTodayAtt]       = useState<AttendanceRecord[]>([]);
  const [weekAtt,        setWeekAtt]        = useState<AttendanceRecord[]>([]);
  const [announcements,  setAnnouncements]  = useState<Announcement[]>([]);
  const [holidays,       setHolidays]       = useState<Holiday[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [approvingId,    setApprovingId]    = useState<string | null>(null);
  const [rejectingId,    setRejectingId]    = useState<string | null>(null);

  const todayStr   = today();
  const last6Dates = getLast6Dates();

  // ── Real-time subscriptions ──────────────────────────────────────────────────
  useEffect(() => {
    const subs: (() => void)[] = [];

    // 1. Active employees
    subs.push(onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'active')),
      snap => { setEmployees(snap.docs.map(d => ({ uid: d.id, ...d.data() } as Employee))); setLoading(false); }
    ));

    // 2. Pending leave requests (sort client-side to avoid index)
    subs.push(onSnapshot(
      query(collection(db, 'leaveRequests'), where('status', '==', 'pending')),
      snap => {
        const leaves = snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest));
        setPendingLeaves(leaves.sort((a, b) => safeDate(b.createdAt).getTime() - safeDate(a.createdAt).getTime()));
      }
    ));

    // 3. Approved leaves (for "on leave today" + pulse chart)
    subs.push(onSnapshot(
      query(collection(db, 'leaveRequests'), where('status', '==', 'approved')),
      snap => setApprovedLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)))
    ));

    // 4. Today's attendance
    subs.push(onSnapshot(
      query(collection(db, 'attendance'), where('date', '==', todayStr)),
      snap => setTodayAtt(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)))
    ));

    // 5. Last 6 days attendance for pulse chart
    subs.push(onSnapshot(
      query(collection(db, 'attendance'), where('date', '>=', last6Dates[0]), where('date', '<=', todayStr)),
      snap => setWeekAtt(snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord)))
    ));

    // 6. Announcements
    subs.push(onSnapshot(
      query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(6)),
      snap => setAnnouncements(snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement))),
      () => {}
    ));

    // 7. Upcoming holidays (filter client-side)
    subs.push(onSnapshot(
      collection(db, 'holidays'),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday));
        setHolidays(all.filter(h => h.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5));
      },
      () => {}
    ));

    return () => subs.forEach(fn => fn());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Computed ───────────────────────────────────────────────────────────────

  const activeCount = employees.length;

  // Department map
  const deptMap = new Map<string, Employee[]>();
  employees.forEach(e => {
    const d = e.department || 'Other';
    if (!deptMap.has(d)) deptMap.set(d, []);
    deptMap.get(d)!.push(e);
  });
  const departments = Array.from(deptMap.entries())
    .map(([name, emps]) => ({
      name,
      count: emps.length,
      head: emps.find(e => e.role === 'manager') ?? emps[0],
    }))
    .sort((a, b) => b.count - a.count);
  const maxDeptCount = Math.max(...departments.map(d => d.count), 1);

  // KPI: present & missing
  const presentToday   = todayAtt.filter(a => a.punchIn).length;
  const missingPunches = todayAtt.filter(a => a.punchIn && !a.punchOut).length;
  const attendanceRate = activeCount > 0 ? Math.round((presentToday / activeCount) * 100) : 0;

  // KPI: on leave today
  const onLeaveToday = approvedLeaves.filter(l => l.startDate <= todayStr && l.endDate >= todayStr);
  const onLeavePaid  = onLeaveToday.filter(l => ['casual', 'paid'].includes(l.type)).length;
  const onLeaveSick  = onLeaveToday.filter(l => l.type === 'sick').length;

  // Actions waiting
  const actionsWaiting = pendingLeaves.length + missingPunches;

  // Pulse chart
  const pulseData = last6Dates.map(date => {
    const dayRecs = weekAtt.filter(a => a.date === date);
    const present = dayRecs.filter(a => a.punchIn).length;
    const onLeave = approvedLeaves.filter(l => l.startDate <= date && l.endDate >= date).length;
    const total   = Math.max(activeCount, present + onLeave, 1);
    return { date, label: getDayLabel(date), present, onLeave, total };
  });

  // Upcoming birthdays (next 7 days)
  const todayMidnight = new Date(); todayMidnight.setHours(0, 0, 0, 0);
  const upcomingBirthdays = employees
    .filter(e => e.birthday)
    .map(e => {
      const [, mm, dd] = e.birthday!.split('-').map(Number);
      let next = new Date(todayMidnight.getFullYear(), mm - 1, dd);
      if (next < todayMidnight) next = new Date(todayMidnight.getFullYear() + 1, mm - 1, dd);
      const daysUntil = Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
      return { ...e, daysUntil };
    })
    .filter(e => e.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 4);

  function birthdayLabel(days: number, date: Employee & { daysUntil: number }) {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  // ── Leave actions ──────────────────────────────────────────────────────────
  async function approveLeave(id: string) {
    setApprovingId(id);
    try { await updateDoc(doc(db, 'leaveRequests', id), { status: 'approved', updatedAt: new Date() }); }
    finally { setApprovingId(null); }
  }

  async function rejectLeave(id: string) {
    setRejectingId(id);
    try { await updateDoc(doc(db, 'leaveRequests', id), { status: 'rejected', updatedAt: new Date() }); }
    finally { setRejectingId(null); }
  }

  // ── Export CSV ────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [
      ['Name', 'Email', 'Department', 'Role'],
      ...employees.map(e => [e.name, e.email, e.department ?? '', e.role]),
    ];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `employees-${todayStr}.csv` });
    a.click(); URL.revokeObjectURL(a.href);
  }

  // ── Date string for header ────────────────────────────────────────────────
  const dateHeader = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const footerTime = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric',
    month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-5">

        {/* ── Page header ───────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-400 mb-0.5 hidden sm:block">{dateHeader}</p>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight leading-tight">People desk</h1>
            <p className="text-sm text-gray-500 mt-1">
              {loading
                ? <span className="inline-block w-40 h-4 rounded bg-gray-200 animate-pulse" />
                : <>
                    {activeCount} employees
                    {actionsWaiting > 0 && (
                      <> · <span className="text-[#1B2B5E] font-semibold">{actionsWaiting} waiting</span></>
                    )}
                  </>
              }
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
              title="Export CSV"
            >
              <Download size={14} />
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {/* ── 4 KPI cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Present today */}
          <div className="bg-[#1B2B5E] rounded-2xl p-5 text-white relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-3">Present Today</p>
            {loading
              ? <div className="w-12 h-10 bg-white/10 rounded animate-pulse mb-2" />
              : <p className="text-[42px] font-black leading-none mb-1">{presentToday}</p>
            }
            <p className="text-xs text-white/40">of {activeCount} total · {attendanceRate}% rate</p>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp size={11} className="text-emerald-400" />
              <span className="text-[11px] font-bold text-emerald-400">+{attendanceRate}%</span>
            </div>
          </div>

          {/* On leave */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">On Leave</p>
            {loading
              ? <div className="w-10 h-10 bg-gray-100 rounded animate-pulse mb-2" />
              : <p className="text-[42px] font-black text-gray-900 leading-none mb-1">{onLeaveToday.length}</p>
            }
            <p className="text-xs text-gray-400">{onLeavePaid} paid · {onLeaveSick} sick</p>
            <div className="mt-2 w-8 h-px bg-gray-200" />
          </div>

          {/* Missing punches */}
          <div className={`rounded-2xl p-5 border shadow-sm ${missingPunches > 0 ? 'bg-[#FFFBEB] border-[#F5C518]/40' : 'bg-white border-gray-100'}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Missing Punches</p>
            {loading
              ? <div className="w-10 h-10 bg-gray-100 rounded animate-pulse mb-2" />
              : <p className="text-[42px] font-black text-gray-900 leading-none mb-1">{missingPunches}</p>
            }
            <p className="text-xs text-gray-500">needs HR review</p>
            {missingPunches > 0 && (
              <div className="flex items-center gap-1 mt-2">
                <AlertCircle size={11} className="text-amber-500" />
                <span className="text-[11px] font-bold text-amber-600">+1</span>
              </div>
            )}
          </div>

          {/* Pending approvals */}
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Pending Approvals</p>
            {loading
              ? <div className="w-10 h-10 bg-gray-100 rounded animate-pulse mb-2" />
              : <p className="text-[42px] font-black text-gray-900 leading-none mb-1">{pendingLeaves.length}</p>
            }
            <p className="text-xs text-gray-400">leave + corrections</p>
            {pendingLeaves.length > 0 && (
              <div className="mt-2">
                <span className="text-[11px] font-bold text-[#1B2B5E]">+{pendingLeaves.length} today</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Attendance pulse + Announcements ───────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Pulse chart */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-gray-900">Attendance pulse</h2>
            <div className="flex items-center justify-between mt-0.5 mb-5">
              <p className="text-xs text-gray-400">Last 6 days · stacked by status</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#1B2B5E]" /> Present
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-[#F5C518]" /> On leave
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-gray-500 font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm inline-block bg-gray-200" /> Missing
                </span>
              </div>
            </div>

            <div className="flex items-end gap-2" style={{ height: '120px' }}>
              {pulseData.map(({ date, label, present, onLeave, total }) => {
                const presentPct = (present / total) * 100;
                const leavePct   = (onLeave  / total) * 100;
                const isToday    = date === todayStr;
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="relative w-full rounded-md overflow-hidden bg-gray-100" style={{ height: '100px' }}>
                      {/* On leave strip — renders behind present block */}
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-md transition-all duration-500"
                        style={{ height: `${presentPct + leavePct}%`, backgroundColor: '#F5C518' }}
                      />
                      {/* Present block — on top of on-leave */}
                      <div
                        className="absolute bottom-0 left-0 right-0 rounded-md transition-all duration-500"
                        style={{ height: `${presentPct}%`, backgroundColor: '#1B2B5E' }}
                      />
                    </div>
                    <span className={`text-[10px] font-semibold ${isToday ? 'text-[#1B2B5E]' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Announcements */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900">Announcements</h2>
              <Link
                href="/admin/announcements"
                className="flex items-center gap-1 text-xs font-semibold text-[#1B2B5E] hover:text-[#243872] transition-colors"
              >
                <Plus size={13} /> Post
              </Link>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {announcements.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-10">No announcements yet</p>
              ) : (
                announcements.map(a => (
                  <div key={a.id} className="px-5 py-3.5 hover:bg-gray-50/60 transition-colors cursor-default">
                    <div className="flex items-center gap-2 mb-1.5">
                      {a.category && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${categoryStyle(a.category)}`}>
                          {a.category}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">
                        {formatAnnouncementDate(a.createdAt ?? a.postedAt)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{a.title}</p>
                    {(a.content || a.body) && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed">{a.content ?? a.body}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Pending approvals table + This week ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Pending approvals */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900">Pending approvals</h2>
                <p className="text-xs text-gray-400 mt-0.5">Action required</p>
              </div>
              <Link href="/admin/leaves" className="flex items-center gap-1 text-xs font-semibold text-[#1B2B5E] hover:text-[#243872] transition-colors">
                View all <ChevronRight size={13} />
              </Link>
            </div>

            {loading ? (
              <div className="divide-y divide-gray-50">
                {[1, 2, 3].map(i => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 w-32 bg-gray-100 rounded animate-pulse" />
                      <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : pendingLeaves.length === 0 ? (
              <div className="py-12 flex flex-col items-center text-center">
                <CalendarCheck size={28} className="text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">All caught up!</p>
              </div>
            ) : (
              <div>
                {/* Column headers */}
                <div className="grid px-5 py-2 border-b border-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-widest"
                  style={{ gridTemplateColumns: '2fr 1fr 1.5fr 0.5fr auto' }}>
                  <span>Employee</span>
                  <span>Type</span>
                  <span>Dates</span>
                  <span>Days</span>
                  <span />
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingLeaves.map(leave => (
                    <div
                      key={leave.id}
                      className="grid items-center px-5 py-3 hover:bg-gray-50/60 gap-3 transition-colors"
                      style={{ gridTemplateColumns: '2fr 1fr 1.5fr 0.5fr auto' }}
                    >
                      {/* Employee */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={leave.employeeName} photo={leave.employeePhotoURL} size={32} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{leave.employeeName}</p>
                          {leave.department && (
                            <p className="text-[10px] text-gray-400 truncate">{leave.department}</p>
                          )}
                        </div>
                      </div>
                      {/* Type */}
                      <span className="text-xs text-gray-600 capitalize leading-tight">{leaveTypeLabel(leave.type)}</span>
                      {/* Dates */}
                      <span className="text-xs text-gray-600">{dateRangeLabel(leave.startDate, leave.endDate)}</span>
                      {/* Days */}
                      <span className="text-xs font-bold text-gray-800">
                        {leave.days ?? daysBetween(leave.startDate, leave.endDate)}d
                      </span>
                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => rejectLeave(leave.id)}
                          disabled={rejectingId === leave.id || approvingId === leave.id}
                          className="w-7 h-7 rounded-md border border-gray-200 flex items-center justify-center text-gray-400 hover:border-red-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title="Reject"
                        >
                          {rejectingId === leave.id
                            ? <span className="w-3 h-3 border border-gray-300 border-t-gray-500 rounded-full animate-spin" />
                            : <X size={12} />
                          }
                        </button>
                        <button
                          onClick={() => approveLeave(leave.id)}
                          disabled={approvingId === leave.id || rejectingId === leave.id}
                          className="flex items-center gap-1 px-3 h-7 rounded-md bg-[#1B2B5E] text-white text-xs font-bold hover:bg-[#243872] transition-colors disabled:opacity-40"
                          title="Approve"
                        >
                          {approvingId === leave.id
                            ? <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            : <><Check size={11} /> Approve</>
                          }
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* This week */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900">This week</h2>
            </div>

            {/* Birthdays */}
            {upcomingBirthdays.length > 0 && (
              <div className="px-5 pt-4 pb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Birthdays</p>
                <div className="space-y-3">
                  {upcomingBirthdays.map(emp => (
                    <div key={emp.uid} className="flex items-center gap-3">
                      <Avatar name={emp.name} photo={emp.photoURL} size={36} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate leading-tight">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.department}</p>
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${
                        emp.daysUntil === 0
                          ? 'bg-[#F5C518] text-gray-900'
                          : 'text-gray-500 bg-gray-100'
                      }`}>
                        {birthdayLabel(emp.daysUntil, emp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Holidays */}
            {holidays.length > 0 && (
              <div className={`px-5 pt-3 pb-4 flex-1 ${upcomingBirthdays.length > 0 ? 'border-t border-gray-100' : ''}`}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Upcoming Holidays</p>
                <div className="space-y-3">
                  {holidays.map(h => {
                    const { day, mon } = holDate(h.date);
                    return (
                      <div key={h.id} className="flex items-center gap-3">
                        <div className="flex flex-col items-center w-9 flex-shrink-0">
                          <span className="text-base font-black text-gray-800 leading-none">{day}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{mon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">{h.name}</p>
                        </div>
                        {h.countries && h.countries.length > 0 && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{h.countries.join(' · ')}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {upcomingBirthdays.length === 0 && holidays.length === 0 && (
              <div className="flex-1 py-10 flex flex-col items-center justify-center text-center">
                <Gift size={24} className="text-gray-200 mb-2" />
                <p className="text-sm text-gray-400">Nothing this week</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Headcount by department ────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Headcount by department</h2>
            <p className="text-xs text-gray-400 mt-0.5">Active employees · ordered by size</p>
          </div>
          {departments.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No department data yet</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-gray-100">
              {departments.map(dept => (
                <div key={dept.name} className="bg-white p-5 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <p className="text-sm font-bold text-gray-800 leading-tight">{dept.name}</p>
                    <span className="text-2xl font-black text-gray-900 leading-none ml-2">{dept.count}</span>
                  </div>
                  <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-[#1B2B5E] rounded-full transition-all duration-700"
                      style={{ width: `${(dept.count / maxDeptCount) * 100}%` }}
                    />
                  </div>
                  {dept.head && (
                    <p className="text-[11px] text-gray-400">
                      {dept.head.name.split(' ').map((n, i) => i === 0 ? `${n[0]}.` : n).join(' ')} · head
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between text-[11px] text-gray-400 pb-2">
          <span>Shipcube HR Control · v1.0.0 · {footerTime}</span>
          <span>Session secured · audit trail active</span>
        </div>

      </div>
    </div>
  );
}
