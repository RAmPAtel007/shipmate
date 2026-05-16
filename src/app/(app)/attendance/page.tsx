'use client';

import { useState, useEffect } from 'react';
import {
  LogIn, LogOut, Clock, CheckCircle2, Calendar,
  Loader2, TrendingUp, Timer, Zap,
} from 'lucide-react';
import {
  collection, query, where, onSnapshot,
  doc, setDoc, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'on_time' | 'late' | 'remote' | 'on_leave' | 'missing';

interface AttendanceRecord {
  uid: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  hours: number;
  status: AttendanceStatus;
  otHours?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AttendanceStatus, { label: string; bg: string; text: string; dot: string }> = {
  on_time:  { label: 'On Time',  bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500'  },
  late:     { label: 'Late',     bg: 'bg-amber-100',  text: 'text-amber-700',  dot: 'bg-amber-400'  },
  remote:   { label: 'Remote',   bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-400'   },
  on_leave: { label: 'On Leave', bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-400' },
  missing:  { label: 'Absent',   bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }

function nowHHMM() {
  return new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function calcHours(pIn: string | null, pOut: string | null): number {
  if (!pIn || !pOut) return 0;
  const [ih, im] = pIn.split(':').map(Number);
  const [oh, om] = pOut.split(':').map(Number);
  const diff = (oh * 60 + om) - (ih * 60 + im);
  return Math.round((diff / 60) * 100) / 100;
}

function autoStatus(punchIn: string): AttendanceStatus {
  const [h, m] = punchIn.split(':').map(Number);
  return (h > 9 || (h === 9 && m > 5)) ? 'late' : 'on_time';
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const { currentUser } = useAuth();
  const [records, setRecords]       = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [liveTime, setLiveTime]     = useState(nowHHMM());
  const [onApprovedLeave, setOnApprovedLeave] = useState(false);
  const [leaveName, setLeaveName]   = useState<string>('');
  const [showPunchOutConfirm, setShowPunchOutConfirm] = useState(false);

  const today = todayISO();
  const todayRec     = records[today] ?? null;
  const isPunchedIn  = !!todayRec?.punchIn;
  const isPunchedOut = !!todayRec?.punchOut;

  // Live clock tick
  useEffect(() => {
    const t = setInterval(() => setLiveTime(nowHHMM()), 10_000);
    return () => clearInterval(t);
  }, []);

  // Real-time attendance listener — single-field query (no composite index needed)
  useEffect(() => {
    if (!currentUser) return;
    const cutoff = (() => {
      const d = new Date(); d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    })();
    setLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), where('uid', '==', currentUser.uid)),
      snap => {
        const m: Record<string, AttendanceRecord> = {};
        snap.docs.forEach(d => {
          const r = d.data() as AttendanceRecord;
          if (r.date >= cutoff) m[r.date] = r;
        });
        setRecords(m);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [currentUser]);

  // Real-time approved leave check — if user has an approved leave covering today, block punch-in
  useEffect(() => {
    if (!currentUser) return;
    // Query approved leaves where this user is the requester and today falls within the range
    const unsub = onSnapshot(
      query(
        collection(db, 'leaveRequests'),
        where('userId', '==', currentUser.uid),
        where('status', '==', 'approved'),
      ),
      snap => {
        const todayStr = todayISO();
        const activeLeave = snap.docs
          .map(d => d.data())
          .find(l => l.startDate <= todayStr && l.endDate >= todayStr);
        if (activeLeave) {
          setOnApprovedLeave(true);
          const typeLabels: Record<string, string> = {
            casual: 'Paid Leave', paid: 'Paid Leave', sick: 'Sick Leave',
            unpaid: 'Unpaid Leave', wfh: 'Work From Home',
            'half-day-first': 'Half Day', 'half-day-second': 'Half Day',
          };
          setLeaveName(typeLabels[activeLeave.type] ?? activeLeave.type ?? 'Leave');
        } else {
          setOnApprovedLeave(false);
          setLeaveName('');
        }
      },
      () => {
        setOnApprovedLeave(false);
      }
    );
    return () => unsub();
  }, [currentUser]);

  async function handlePunchIn() {
    if (!currentUser) return;
    setSaving(true);
    const now = nowHHMM();
    const status = autoStatus(now);
    try {
      await setDoc(doc(db, 'attendance', `${currentUser.uid}_${today}`), {
        uid: currentUser.uid,
        date: today,
        punchIn: now,
        punchOut: null,
        hours: 0,
        status,
        createdAt: serverTimestamp(),
      }, { merge: true });
      toast.success(
        status === 'late'
          ? `Punched in at ${now} · Running late 😬`
          : `Punched in at ${now} · On time! 🎉`,
      );
    } catch { toast.error('Failed to punch in'); }
    finally { setSaving(false); }
  }

  async function handlePunchOut() {
    if (!currentUser || !todayRec?.punchIn) return;
    setSaving(true);
    const now = nowHHMM();
    const hours = calcHours(todayRec.punchIn, now);
    try {
      await setDoc(doc(db, 'attendance', `${currentUser.uid}_${today}`), {
        punchOut: now,
        hours,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success(`Punched out at ${now} · ${hours}h logged 👍`);
    } catch { toast.error('Failed to punch out'); }
    finally { setSaving(false); }
  }

  // ── Stats (last 7 days) ────────────────────────────────────────────────────

  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
  const withRec   = last7.filter(d => records[d] && d !== today);
  const onTimePct = withRec.length
    ? Math.round(withRec.filter(d => records[d].status === 'on_time').length / withRec.length * 100)
    : 0;
  const totalHours = withRec.reduce((s, d) => s + (records[d].hours ?? 0), 0);
  const avgIn = (() => {
    const times = withRec.map(d => records[d].punchIn).filter(Boolean) as string[];
    if (!times.length) return '—';
    const mins = times.map(t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
    const avg  = Math.round(mins.reduce((a, b) => a + b, 0) / mins.length);
    return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
  })();

  // ── History (last 30 days including today, newest first) ─────────────────

  const historyDates = Array.from({ length: 31 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  });

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#1B2B5E]" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">

      {/* ── Header banner ──────────────────────────────────────────────────── */}
      <div className="bg-[#1B2B5E] px-6 pt-6 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2B5E] to-[#2D4080] pointer-events-none" />
        <div className="relative">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-white font-black text-2xl">Attendance</h1>
          <p className="text-[#F5C518] font-mono font-black text-4xl mt-2 leading-none">{liveTime}</p>
        </div>
      </div>

      <div className="px-4 -mt-10 pb-10 space-y-4">

        {/* ── Today's card ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Today</p>
            {todayRec && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${STATUS_CFG[todayRec.status]?.bg} ${STATUS_CFG[todayRec.status]?.text}`}>
                {STATUS_CFG[todayRec.status]?.label}
              </span>
            )}
          </div>

          {/* Punch In / Punch Out times */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <LogIn size={10} />In
              </p>
              <p className="text-xl font-black text-green-700">{todayRec?.punchIn ?? '—'}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-3 text-center">
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <LogOut size={10} />Out
              </p>
              <p className="text-xl font-black text-red-600">{todayRec?.punchOut ?? '—'}</p>
            </div>
          </div>

          {/* Hours / in-progress banner */}
          {isPunchedIn && !isPunchedOut && (
            <div className="flex items-center justify-center gap-2 bg-amber-50 border border-amber-100 rounded-xl py-2 mb-4">
              <Timer size={13} className="text-amber-500" />
              <span className="text-xs font-bold text-amber-600">In progress since {todayRec.punchIn}</span>
            </div>
          )}
          {isPunchedOut && (
            <div className="flex items-center justify-center gap-2 bg-gray-50 rounded-xl py-2 mb-4">
              <Clock size={13} className="text-gray-400" />
              <span className="text-xs font-bold text-gray-600">{todayRec.hours}h worked today</span>
            </div>
          )}

          {/* Action button */}
          {onApprovedLeave && !isPunchedIn ? (
            /* Blocked — user is on approved leave today */
            <div className="w-full py-4 rounded-2xl bg-violet-50 border border-violet-200 text-violet-700 font-bold text-sm flex flex-col items-center justify-center gap-1.5">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-violet-500" />
                <span>You're on {leaveName} today</span>
              </div>
              <span className="text-xs font-normal text-violet-500">Attendance cannot be marked while on approved leave.</span>
            </div>
          ) : !isPunchedIn ? (
            <button
              onClick={handlePunchIn} disabled={saving}
              className="w-full py-4 rounded-2xl bg-[#1B2B5E] text-white font-black text-base hover:bg-[#2D4080] active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg shadow-[#1B2B5E]/20"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
              Punch In
            </button>
          ) : !isPunchedOut ? (
            <button
              onClick={() => setShowPunchOutConfirm(true)} disabled={saving}
              className="w-full py-4 rounded-2xl bg-red-500 text-white font-black text-base hover:bg-red-600 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2.5 shadow-lg shadow-red-500/20"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
              Punch Out
            </button>
          ) : (
            <div className="w-full py-3.5 rounded-2xl bg-green-50 border border-green-100 text-green-700 font-bold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 size={16} />
              Day complete · {todayRec.hours}h logged
            </div>
          )}
        </div>

        {/* ── 7-day stats ────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'On Time', val: `${onTimePct}%`, icon: <Zap size={13} />,       color: 'text-green-600 bg-green-50'  },
            { label: 'Avg In',  val: avgIn,            icon: <Clock size={13} />,      color: 'text-blue-600 bg-blue-50'    },
            { label: 'Hours',   val: `${Math.round(totalHours * 10) / 10}h`, icon: <TrendingUp size={13} />, color: 'text-violet-600 bg-violet-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-4 text-center">
              <div className={`w-7 h-7 rounded-lg ${s.color} flex items-center justify-center mx-auto mb-2`}>
                {s.icon}
              </div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{s.label}</p>
              <p className="text-xl font-black text-gray-800 mt-0.5">{s.val}</p>
              <p className="text-[10px] text-gray-400">last 7 days</p>
            </div>
          ))}
        </div>

        {/* ── History ─────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <Calendar size={12} className="text-gray-400" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">History — Last 30 Days</p>
          </div>

          <div className="divide-y divide-gray-50">
            {historyDates.map(date => {
              const r = records[date];
              const isToday = date === today;
              const d = new Date(date + 'T00:00:00');
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;

              // Skip empty weekdays that are also not today
              if (!r && isWeekend && !isToday) return null;
              // For today with no record yet, still show it so punch-in appears
              if (!r && !isToday && isWeekend) return null;

              const dayLabel  = isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
              const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <div
                  key={date}
                  className={`flex items-center px-5 py-3 gap-3 ${
                    isToday ? 'bg-[#1B2B5E]/3 border-l-2 border-[#1B2B5E]' : isWeekend ? 'bg-gray-50/40' : ''
                  }`}
                >
                  {/* Date */}
                  <div className="w-14 flex-shrink-0">
                    <p className={`text-xs font-semibold ${isToday ? 'text-[#1B2B5E]' : 'text-gray-600'}`}>{dayLabel}</p>
                    <p className="text-[11px] text-gray-400">{dateLabel}</p>
                  </div>

                  {r ? (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="text-xs font-mono text-gray-600 w-11 flex-shrink-0">{r.punchIn ?? '—'}</span>
                        <span className="text-gray-300 text-[10px]">→</span>
                        <span className="text-xs font-mono text-gray-600 w-11 flex-shrink-0">{r.punchOut ?? '—'}</span>
                        {r.hours > 0 && <span className="text-[11px] text-gray-400">{r.hours}h</span>}
                        {isToday && r.punchIn && !r.punchOut && (
                          <span className="text-[10px] text-amber-500 font-medium animate-pulse">live</span>
                        )}
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CFG[r.status]?.bg} ${STATUS_CFG[r.status]?.text}`}>
                        {STATUS_CFG[r.status]?.label}
                      </span>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-between">
                      <span className="text-xs text-gray-300">
                        {isToday ? 'Not punched in yet' : isWeekend ? 'Weekend' : 'No record'}
                      </span>
                      {!isToday && !isWeekend && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-400">Absent</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Punch Out Confirmation Modal ──────────────────────────────────────── */}
      {showPunchOutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden">
            {/* Top accent */}
            <div className="h-1.5 bg-gradient-to-r from-red-400 to-red-600" />

            <div className="p-6">
              {/* Icon */}
              <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <LogOut size={26} className="text-red-500" />
              </div>

              {/* Text */}
              <h3 className="text-lg font-black text-gray-900 text-center">Punch Out?</h3>
              <p className="text-sm text-gray-500 text-center mt-1.5 leading-snug">
                You're punching out at <span className="font-bold text-gray-800">{liveTime}</span>.
                {todayRec?.punchIn && (
                  <> You've been in since <span className="font-bold text-gray-800">{todayRec.punchIn}</span>.</>
                )}
              </p>
              <p className="text-xs text-gray-400 text-center mt-1">This action cannot be undone.</p>

              {/* Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowPunchOutConfirm(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setShowPunchOutConfirm(false); handlePunchOut(); }}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-black active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-red-500/20"
                >
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
                  Yes, Punch Out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
