'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Search, X, CheckCircle2, XCircle, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { collection, getDocs, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { leaveService } from '@/lib/services/leaveService';
import { formatDate, getLeaveTypeLabel } from '@/lib/utils/formatters';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { LeaveRequest, LeaveStatus, LeaveType } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_FILTER: { label: string; value: LeaveStatus | 'all' }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Pending',   value: 'pending' },
  { label: 'Approved',  value: 'approved' },
  { label: 'Rejected',  value: 'rejected' },
  { label: 'Cancelled', value: 'cancelled' },
];

const statusStyle: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

// Calendar leave type colors (matching reference: paid=navy, casual/wfh=amber, sick=blue)
const LEAVE_COLORS: Record<LeaveType, { bar: string; text: string }> = {
  'sick':           { bar: 'bg-blue-400',   text: 'text-white' },
  'casual':         { bar: 'bg-[#F5C518]',  text: 'text-gray-900' },
  'wfh':            { bar: 'bg-amber-300',  text: 'text-gray-900' },
  'unpaid':         { bar: 'bg-gray-400',   text: 'text-white' },
  'half-day-first': { bar: 'bg-slate-400',  text: 'text-white' },
  'half-day-second':{ bar: 'bg-slate-400',  text: 'text-white' },
};
const DEFAULT_LEAVE_COLOR = { bar: 'bg-[#1B2B5E]', text: 'text-white' };

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

type Tab = 'queue' | 'all' | 'calendar' | 'policies';
type ActionMode = { type: 'approve' | 'reject'; leaveId: string } | null;

// ─── Calendar Helpers ─────────────────────────────────────────────────────────

function buildCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  // Align to Monday (0=Sun→6, 1=Mon→0, ...)
  let startOffset = (firstDay.getDay() + 6) % 7; // days before month starts
  const start = new Date(firstDay);
  start.setDate(start.getDate() - startOffset);

  const weeks: Date[][] = [];
  const cursor = new Date(start);
  while (cursor.getMonth() <= month || cursor.getFullYear() < year || weeks.length < 5) {
    const week: Date[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor.getMonth() > month && cursor.getFullYear() >= year) break;
    if (weeks.length >= 6) break;
  }
  return weeks;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function firstNameLastInitial(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// Absent employee record shape (from attendance collection)
interface AttendanceSnap { uid: string; date: string; status: string; }

// ─── Team Calendar ────────────────────────────────────────────────────────────

function TeamCalendar() {
  const now   = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth());
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  // Map of date → Set of absent uids (missing / no punch-in, not on leave)
  const [absentMap, setAbsentMap] = useState<Map<string, Set<string>>>(new Map());
  // Map of uid → name (from users collection)
  const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  // Load users once
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'active')),
      snap => {
        const m = new Map<string, string>();
        snap.docs.forEach(d => { const u = d.data(); m.set(d.id, u.name); });
        setUserNames(m);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay  = isoDate(new Date(year, month + 1, 0));

    // Leaves — single-field query, filter status client-side
    const unsubLeaves = onSnapshot(
      query(collection(db, 'leaveRequests'), where('startDate', '<=', lastDay)),
      snap => {
        const all = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as LeaveRequest))
          .filter(l => l.status === 'approved' && l.endDate >= firstDay);
        setLeaves(all);
        setLoading(false);
      },
      () => setLoading(false)
    );

    // Attendance for this month — build absent map
    const unsubAtt = onSnapshot(
      query(
        collection(db, 'attendance'),
        where('date', '>=', firstDay),
        where('date', '<=', lastDay)
      ),
      snap => {
        const m = new Map<string, Set<string>>();
        snap.docs.forEach(d => {
          const a = d.data() as AttendanceSnap;
          if (a.status === 'missing') {
            if (!m.has(a.date)) m.set(a.date, new Set());
            m.get(a.date)!.add(a.uid);
          }
        });
        setAbsentMap(m);
      }
    );

    return () => { unsubLeaves(); unsubAtt(); };
  }, [year, month]);

  const weeks = useMemo(() => buildCalendarWeeks(year, month), [year, month]);
  const today = isoDate(new Date());

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  // For each day, gather leaves that span it
  function leavesOnDay(dateISO: string): (LeaveRequest & { color: { bar: string; text: string } })[] {
    return leaves
      .filter(l => l.startDate <= dateISO && l.endDate >= dateISO)
      .map(l => ({ ...l, color: LEAVE_COLORS[l.type] ?? DEFAULT_LEAVE_COLOR }));
  }

  // Absent employees on a given day (not on approved leave)
  function absentOnDay(dateISO: string): string[] {
    const onLeaveUids = new Set(leavesOnDay(dateISO).map(l => l.employeeId));
    const absentUids  = absentMap.get(dateISO) ?? new Set<string>();
    return Array.from(absentUids)
      .filter(uid => !onLeaveUids.has(uid))
      .map(uid => userNames.get(uid) ?? uid)
      .filter(Boolean);
  }

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h2 className="text-lg font-black text-gray-900">
              {MONTH_NAMES[month]} {year}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Who&apos;s out, by day</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Legend */}
            <div className="flex items-center gap-3 mr-4">
              {[
                { color: 'bg-[#1B2B5E]', label: 'Paid / Earned' },
                { color: 'bg-[#F5C518]',  label: 'Casual / WFH' },
                { color: 'bg-blue-400',   label: 'Sick' },
                { color: 'bg-gray-400',   label: 'Unpaid' },
                { color: 'bg-red-200',    label: 'Absent' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded-full ${color}`}/>
                  <span className="text-xs text-gray-500">{label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={prevMonth}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                <ChevronLeft size={16}/>
              </button>
              <button onClick={nextMonth}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
                <ChevronRight size={16}/>
              </button>
            </div>
          </div>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100 mt-4">
          {DAYS.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-bold text-gray-400 tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading calendar…</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((day, di) => {
                  const dayISO    = isoDate(day);
                  const inMonth   = day.getMonth() === month;
                  const isToday   = dayISO === today;
                  const isPast    = dayISO < today;
                  const dayLeaves = leavesOnDay(dayISO);
                  const dayAbsent = inMonth && isPast ? absentOnDay(dayISO) : [];
                  const totalSlots = dayLeaves.length + dayAbsent.length;
                  const maxShow = 3;
                  const overflow = Math.max(0, totalSlots - maxShow);
                  return (
                    <div
                      key={di}
                      className={`min-h-[90px] p-1.5 border-r border-gray-50 last:border-r-0 ${
                        !inMonth ? 'bg-gray-50/40' : ''
                      }`}
                    >
                      <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${
                        isToday
                          ? 'bg-[#1B2B5E] text-white'
                          : inMonth ? 'text-gray-700' : 'text-gray-300'
                      }`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {/* Approved leave bars */}
                        {dayLeaves.slice(0, maxShow).map(l => (
                          <div
                            key={l.id}
                            title={`${l.employeeName} — ${getLeaveTypeLabel(l.type)}`}
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate ${l.color.bar} ${l.color.text}`}
                          >
                            {firstNameLastInitial(l.employeeName)}
                          </div>
                        ))}
                        {/* Absent bars (only if leaves didn't already fill the slots) */}
                        {dayAbsent.slice(0, Math.max(0, maxShow - dayLeaves.length)).map((name, ai) => (
                          <div
                            key={`absent-${ai}`}
                            title={`${name} — Absent`}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded truncate bg-red-100 text-red-700 border border-red-200"
                          >
                            {firstNameLastInitial(name)}
                          </div>
                        ))}
                        {overflow > 0 && (
                          <div className="text-[10px] text-gray-400 font-semibold pl-1">
                            +{overflow} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming leaves list */}
      {leaves.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-bold text-gray-800 mb-3">
            Approved leaves this month ({leaves.length})
          </p>
          <div className="divide-y divide-gray-50">
            {[...leaves]
              .sort((a, b) => a.startDate.localeCompare(b.startDate))
              .map(l => {
                const color = LEAVE_COLORS[l.type] ?? DEFAULT_LEAVE_COLOR;
                return (
                  <div key={l.id} className="flex items-center gap-3 py-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.bar}`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{l.employeeName}</p>
                      <p className="text-xs text-gray-400">{l.departmentId}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-gray-700">
                        {formatDate(l.startDate)}
                        {l.endDate !== l.startDate && ` → ${formatDate(l.endDate)}`}
                      </p>
                      <p className="text-xs text-gray-400 capitalize">
                        {getLeaveTypeLabel(l.type)} · {l.durationDays}d
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Policies & Balances (placeholder) ───────────────────────────────────────

function PoliciesTab() {
  const types = [
    { label: 'Casual Leave',   days: 12, cycle: 'per year', note: 'Max 3 consecutive days. Carry forward: 5 days.' },
    { label: 'Sick Leave',     days: 10, cycle: 'per year', note: 'Medical certificate required for 3+ days.' },
    { label: 'WFH',            days: 24, cycle: 'per year', note: 'Max 2 days/week. Manager approval required.' },
    { label: 'Unpaid Leave',   days: null, cycle: '', note: 'Approved case-by-case. Deducted from monthly salary.' },
    { label: 'Half-Day Leave', days: null, cycle: '', note: 'Deducted at 0.5 from Casual balance.' },
  ];
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-sm font-black text-gray-800 mb-4">Leave Policies</p>
        <div className="space-y-3">
          {types.map(t => (
            <div key={t.label} className="flex items-start gap-4 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-[#1B2B5E]/8 flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-black text-[#1B2B5E]">{t.days ?? '∞'}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-gray-800">{t.label}</p>
                <p className="text-xs text-[#1B2B5E] font-semibold">{t.days ? `${t.days} days ${t.cycle}` : 'Discretionary'}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-[#1B2B5E]/5 border border-[#1B2B5E]/10 rounded-2xl px-5 py-4">
        <p className="text-xs font-bold text-[#1B2B5E] mb-1">Approval Flow</p>
        <p className="text-xs text-gray-600">
          Employees submit leave requests which are reviewed and approved or rejected by the admin.
        </p>
      </div>
    </div>
  );
}

// ─── Approval Queue (module-level — must NOT be inside AdminLeavesPage) ────────

interface ApprovalQueueProps {
  pending: LeaveRequest[];
  actionMode: ActionMode;
  actioning: string | null;
  comment: string;
  commentRef: React.RefObject<HTMLTextAreaElement>;
  forceLTR: () => void;
  setActionMode: (m: ActionMode) => void;
  setComment: (v: string) => void;
  onApprove: (leave: LeaveRequest) => void;
  onReject: (leave: LeaveRequest) => void;
}

function ApprovalQueue({
  pending, actionMode, actioning, comment, commentRef, forceLTR,
  setActionMode, setComment, onApprove, onReject,
}: ApprovalQueueProps) {
  if (pending.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
        <CheckCircle2 size={32} className="text-emerald-300 mx-auto mb-3"/>
        <p className="text-sm font-semibold text-gray-500">No pending leave requests 🎉</p>
        <p className="text-xs text-gray-400 mt-1">All caught up!</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {pending.map(leave => (
        <div key={leave.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="p-5">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center text-sm font-bold text-[#1B2B5E] flex-shrink-0">
                {leave.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{leave.employeeName}</p>
                      <span className="text-[11px] bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">{leave.departmentId}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-0.5">
                      <span className="font-semibold capitalize">{getLeaveTypeLabel(leave.type)}</span>
                      {' · '}
                      {formatDate(leave.startDate)}
                      {leave.endDate !== leave.startDate && ` → ${formatDate(leave.endDate)}`}
                      {' '}
                      <span className="text-gray-400">({leave.durationDays}d)</span>
                    </p>
                    {leave.reason && (
                      <p className="text-xs text-gray-500 mt-1 italic">{leave.reason}</p>
                    )}
                  </div>
                  <span className="text-[11px] font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full flex-shrink-0">
                    Pending
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 mt-4">
              <button
                onClick={() => { setActionMode({ type: 'reject', leaveId: leave.id }); setComment(''); }}
                disabled={!!actioning}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                <XCircle size={13}/>Decline
              </button>
              <button
                onClick={() => { setActionMode(null); setComment(''); }}
                disabled={!!actioning}
                className="flex items-center gap-1.5 px-3.5 py-2 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                Request more info
              </button>
              <button
                onClick={() => { setActionMode({ type: 'approve', leaveId: leave.id }); setComment(''); }}
                disabled={!!actioning}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-[#1B2B5E] text-white hover:bg-[#2D4080] rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                <CheckCircle2 size={13}/>Approve
              </button>
            </div>
          </div>

          {/* Inline action panel */}
          {actionMode?.leaveId === leave.id && (
            <div className={`px-5 py-4 border-t ${
              actionMode.type === 'approve' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'
            }`}>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-gray-600 mb-1.5">
                    {actionMode.type === 'approve'
                      ? '✅ Add a message for the employee (optional)'
                      : '❌ Rejection reason — employee will see this (required)'}
                  </p>
                  <textarea
                    ref={commentRef}
                    rows={2}
                    dir="ltr"
                    lang="en"
                    spellCheck={false}
                    autoComplete="off"
                    autoCorrect="off"
                    style={{ direction: 'ltr', unicodeBidi: 'embed', textAlign: 'left', writingMode: 'horizontal-tb' }}
                    placeholder={actionMode.type === 'approve'
                      ? 'e.g. Approved! Enjoy your time off. 🌴'
                      : 'e.g. We need full team coverage on those dates.'}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    onFocus={forceLTR}
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none resize-none text-left ${
                      actionMode.type === 'approve'
                        ? 'border-emerald-200 focus:border-emerald-400 bg-white'
                        : 'border-red-200 focus:border-red-400 bg-white'
                    }`}
                  />
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0 pt-5">
                  <button
                    onClick={() => actionMode.type === 'approve' ? onApprove(leave) : onReject(leave)}
                    disabled={actioning === leave.id || (actionMode.type === 'reject' && !comment.trim())}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${
                      actionMode.type === 'approve'
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    }`}
                  >
                    {actioning === leave.id ? 'Saving…' : actionMode.type === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                  </button>
                  <button
                    onClick={() => { setActionMode(null); setComment(''); }}
                    className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminLeavesPage() {
  const { currentUser } = useAuth();
  const [activeTab,    setActiveTab]    = useState<Tab>('queue');
  const [leaves,       setLeaves]       = useState<LeaveRequest[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('all');
  const [actioning,    setActioning]    = useState<string | null>(null);
  const [actionMode,   setActionMode]   = useState<ActionMode>(null);
  const [comment,      setComment]      = useState('');
  const commentRef = useRef<HTMLTextAreaElement>(null);

  const forceLTR = useCallback(() => {
    const el = commentRef.current;
    if (!el) return;
    el.setAttribute('dir', 'ltr');
    el.style.setProperty('direction', 'ltr', 'important');
    el.style.setProperty('text-align', 'left', 'important');
    el.style.setProperty('unicode-bidi', 'embed', 'important');
    el.style.setProperty('writing-mode', 'horizontal-tb', 'important');
  }, []);

  useEffect(() => {
    if (!actionMode) return;
    // Small delay to ensure textarea is rendered before focusing
    const t = setTimeout(() => {
      forceLTR();
      commentRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [actionMode, forceLTR]);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc')));
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const pending = leaves.filter(l => l.status === 'pending');

  const filtered = leaves.filter(l => {
    const matchSearch = !search || l.employeeName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function approve(leave: LeaveRequest) {
    if (!currentUser) return;
    setActioning(leave.id);
    try {
      await leaveService.approveLeave(leave.id, currentUser.uid, currentUser.name, comment.trim() || undefined);
      toast.success(`✅ Approved ${leave.employeeName}'s leave`);
      setActionMode(null); setComment(''); load();
    } catch { toast.error('Failed to approve'); }
    finally { setActioning(null); }
  }

  async function reject(leave: LeaveRequest) {
    if (!currentUser || !comment.trim()) return;
    setActioning(leave.id);
    try {
      await leaveService.rejectLeave(leave.id, currentUser.uid, currentUser.name, comment.trim());
      toast.success('Leave rejected');
      setActionMode(null); setComment(''); load();
    } catch { toast.error('Failed to reject'); }
    finally { setActioning(null); }
  }

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: 'queue',    label: 'Approval queue', badge: pending.length },
    { id: 'all',      label: 'All requests'   },
    { id: 'calendar', label: 'Team calendar'  },
    { id: 'policies', label: 'Policies & balances' },
  ];

  // ── All Requests table ───────────────────────────────────────────────────────
  function AllRequests() {
    return (
      <>
        <div className="flex gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input
              type="text" placeholder="Search by employee name…"
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm
                focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={14}/>
              </button>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTER.map(s => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                  statusFilter === s.value
                    ? 'bg-[#1B2B5E] text-white border-[#1B2B5E]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#1B2B5E]/30'
                }`}>
                {s.label}
                {s.value === 'pending' && pending.length > 0 && (
                  <span className="ml-1.5 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Employee','Type','Dates','Status','Reason / Response',''].map(h => (
                  <th key={h} className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-6 py-4"><div className="h-4 rounded shimmer"/></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <p className="text-gray-400 text-sm font-medium">No leave requests found</p>
                  </td>
                </tr>
              ) : filtered.map(leave => (
                <tr key={leave.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-[#1B2B5E] text-xs font-bold">
                          {leave.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{leave.employeeName}</p>
                        <p className="text-xs text-gray-400">{leave.departmentId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-700 capitalize">{getLeaveTypeLabel(leave.type)}</span>
                    <p className="text-xs text-gray-400">{leave.durationDays}d</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-700">{formatDate(leave.startDate)}</p>
                    {leave.endDate !== leave.startDate && (
                      <p className="text-xs text-gray-400">→ {formatDate(leave.endDate)}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyle[leave.status]}`}>
                      {leave.status}
                    </span>
                    {leave.approverName && (
                      <p className="text-[10px] text-gray-400 mt-1">by {leave.approverName}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 max-w-[220px]">
                    <p className="text-sm text-gray-500 truncate">{leave.reason}</p>
                    {leave.adminMessage && (
                      <div className="flex items-start gap-1 mt-1">
                        <MessageSquare size={10} className={`flex-shrink-0 mt-0.5 ${leave.status === 'approved' ? 'text-emerald-500' : 'text-red-400'}`}/>
                        <p className={`text-xs italic truncate ${leave.status === 'approved' ? 'text-emerald-600' : 'text-red-500'}`}>
                          &ldquo;{leave.adminMessage}&rdquo;
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {leave.status === 'pending' && (
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setActionMode({ type: 'approve', leaveId: leave.id }); setComment(''); }} disabled={!!actioning}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
                          <CheckCircle2 size={13}/>Approve
                        </button>
                        <button onClick={() => { setActionMode({ type: 'reject', leaveId: leave.id }); setComment(''); }} disabled={!!actioning}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50">
                          <XCircle size={13}/>Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Leave Management</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            <span className="text-amber-600 font-semibold">{pending.length} pending</span> approval{pending.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-100">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all -mb-[1px] ${
              activeTab === tab.id
                ? 'border-[#1B2B5E] text-[#1B2B5E]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === 'queue'    && (
        <ApprovalQueue
          pending={pending}
          actionMode={actionMode}
          actioning={actioning}
          comment={comment}
          commentRef={commentRef}
          forceLTR={forceLTR}
          setActionMode={setActionMode}
          setComment={setComment}
          onApprove={approve}
          onReject={reject}
        />
      )}
      {activeTab === 'all'      && <AllRequests/>}
      {activeTab === 'calendar' && <TeamCalendar/>}
      {activeTab === 'policies' && <PoliciesTab/>}
    </div>
  );
}
