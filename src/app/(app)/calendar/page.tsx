'use client';

import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { getLeaveTypeLabel } from '@/lib/utils/formatters';
import type { LeaveRequest, LeaveType } from '@/lib/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS       = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const LEAVE_COLORS: Record<LeaveType, { bar: string; text: string }> = {
  'sick':            { bar: 'bg-blue-400',   text: 'text-white' },
  'casual':          { bar: 'bg-[#F5C518]',  text: 'text-gray-900' },
  'wfh':             { bar: 'bg-amber-300',  text: 'text-gray-900' },
  'unpaid':          { bar: 'bg-gray-400',   text: 'text-white' },
  'half-day-first':  { bar: 'bg-slate-400',  text: 'text-white' },
  'half-day-second': { bar: 'bg-slate-400',  text: 'text-white' },
};
const DEFAULT_LEAVE_COLOR = { bar: 'bg-[#1B2B5E]', text: 'text-white' };

const LEGEND = [
  { color: 'bg-[#1B2B5E]', label: 'Paid / Earned' },
  { color: 'bg-[#F5C518]',  label: 'Casual / WFH'  },
  { color: 'bg-blue-400',   label: 'Sick'           },
  { color: 'bg-gray-400',   label: 'Unpaid'         },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function firstNameLastInitial(fullName: string): string {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function buildCalendarWeeks(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeamCalendarPage() {
  const now    = new Date();
  const [year,   setYear]   = useState(now.getFullYear());
  const [month,  setMonth]  = useState(now.getMonth());
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay  = isoDate(new Date(year, month + 1, 0));

    const unsub = onSnapshot(
      query(
        collection(db, 'leaveRequests'),
        where('startDate', '<=', lastDay),
      ),
      snap => {
        const approved = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as LeaveRequest))
          .filter(l => l.status === 'approved' && l.endDate >= firstDay);
        setLeaves(approved);
        setLoading(false);
      },
      () => setLoading(false),
    );

    return () => unsub();
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
  function goToday() {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }

  function leavesOnDay(dateISO: string) {
    return leaves
      .filter(l => l.startDate <= dateISO && l.endDate >= dateISO)
      .map(l => ({ ...l, color: LEAVE_COLORS[l.type] ?? DEFAULT_LEAVE_COLOR }));
  }

  const upcomingLeaves = [...leaves]
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-5 md:px-6 md:py-7 space-y-5">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <CalendarDays size={20} className="text-[#1B2B5E]" />
              <h1 className="text-2xl font-black text-gray-900">Team Calendar</h1>
            </div>
            <p className="text-sm text-gray-400 ml-8">See who&apos;s off this month</p>
          </div>
          <button
            onClick={goToday}
            className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-xl bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
        </div>

        {/* ── Calendar card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* Calendar header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-50">
            <div>
              <h2 className="text-lg font-black text-gray-900">
                {MONTH_NAMES[month]} {year}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {leaves.length} approved leave{leaves.length !== 1 ? 's' : ''} this month
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Legend — hidden on very small screens */}
              <div className="hidden sm:flex items-center gap-3">
                {LEGEND.map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                    <span className="text-xs text-gray-400">{label}</span>
                  </div>
                ))}
              </div>
              {/* Month navigation */}
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={nextMonth}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Calendar grid */}
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">

              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-gray-50">
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
                        const dayLeaves = leavesOnDay(dayISO);
                        const maxShow   = 3;
                        const overflow  = Math.max(0, dayLeaves.length - maxShow);

                        return (
                          <div
                            key={di}
                            className={`min-h-[80px] p-1.5 border-r border-gray-50 last:border-r-0 ${
                              !inMonth ? 'bg-gray-50/50' : isToday ? 'bg-[#1B2B5E]/3' : ''
                            }`}
                          >
                            {/* Date number */}
                            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold mb-1 ${
                              isToday
                                ? 'bg-[#1B2B5E] text-white'
                                : inMonth ? 'text-gray-700' : 'text-gray-300'
                            }`}>
                              {day.getDate()}
                            </div>

                            {/* Leave bars */}
                            <div className="space-y-0.5">
                              {dayLeaves.slice(0, maxShow).map(l => (
                                <div
                                  key={l.id}
                                  title={`${l.employeeName} — ${getLeaveTypeLabel(l.type)}`}
                                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded truncate ${l.color.bar} ${l.color.text}`}
                                >
                                  {firstNameLastInitial(l.employeeName)}
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
          </div>
        </div>

        {/* ── Approved leaves list ── */}
        {!loading && upcomingLeaves.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <p className="text-sm font-bold text-gray-800 mb-4">
              Who&apos;s off — {MONTH_NAMES[month]} {year}
            </p>
            <div className="divide-y divide-gray-50">
              {upcomingLeaves.map(l => {
                const color = LEAVE_COLORS[l.type] ?? DEFAULT_LEAVE_COLOR;
                return (
                  <div key={l.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    {/* Color dot */}
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${color.bar}`} />
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-[10px] font-bold text-[#1B2B5E]">
                        {l.employeeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    {/* Name + dept */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{l.employeeName}</p>
                      <p className="text-xs text-gray-400 capitalize">{l.departmentId?.replace(/-/g, ' ')}</p>
                    </div>
                    {/* Type + dates */}
                    <div className="text-right flex-shrink-0">
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

        {/* ── Empty state ── */}
        {!loading && upcomingLeaves.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-14 text-center">
            <CalendarDays size={32} className="text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-400">No approved leaves this month</p>
            <p className="text-xs text-gray-300 mt-1">Everyone&apos;s in! 🎉</p>
          </div>
        )}

      </div>
    </div>
  );
}
