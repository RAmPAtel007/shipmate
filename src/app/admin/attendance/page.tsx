'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Download, Bell, Search, Edit2, X, Loader2, Clock,
} from 'lucide-react';
import {
  collection, onSnapshot, query, where, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import type { ShipmateUser } from '@/lib/types';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'on_time' | 'late' | 'remote' | 'on_leave' | 'missing';
type StatusFilter = AttendanceStatus | 'all';

interface AttendanceRecord {
  uid: string;
  date: string;
  punchIn: string | null;
  punchOut: string | null;
  hours: number;
  status: AttendanceStatus;
  correctedBy?: string;
  correctionReason?: string;
  correctedAt?: any;
}

interface AttendanceRow {
  user: ShipmateUser;
  record: AttendanceRecord | null;
  status: AttendanceStatus;
  empIdx: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AttendanceStatus, {
  label: string; dot: string; bg: string; text: string; border: string;
}> = {
  on_time: { label: 'On time',   dot: 'bg-green-500',  bg: 'bg-green-50',   text: 'text-green-700',  border: 'border-green-200' },
  late:    { label: 'Late',      dot: 'bg-amber-400',  bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  remote:  { label: 'Remote',    dot: 'bg-blue-400',   bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200'  },
  on_leave:{ label: 'On leave',  dot: 'bg-violet-400', bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200'},
  missing: { label: 'Missing',   dot: 'bg-red-500',    bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200'   },
};

const FILTER_LABELS: { v: StatusFilter; label: string }[] = [
  { v: 'all',      label: 'All'      },
  { v: 'late',     label: 'Late'     },
  { v: 'missing',  label: 'Missing'  },
  { v: 'remote',   label: 'Remote'   },
  { v: 'on_leave', label: 'On leave' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

// ─── Correction Modal ─────────────────────────────────────────────────────────

function CorrectionModal({
  row, adminName, onClose,
}: { row: AttendanceRow; adminName: string; onClose: () => void }) {
  const [punchIn,  setPunchIn]  = useState(row.record?.punchIn  ?? '09:00');
  const [punchOut, setPunchOut] = useState(row.record?.punchOut ?? '18:00');
  const [reason,   setReason]   = useState('');
  const [saving,   setSaving]   = useState(false);
  const today = todayISO();

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });

  async function handleSave() {
    if (!reason.trim()) { toast.error('Reason is required'); return; }
    setSaving(true);
    try {
      const hours  = calcHours(punchIn, punchOut);
      const status = autoStatus(punchIn);
      await setDoc(doc(db, 'attendance', `${row.user.uid}_${today}`), {
        uid: row.user.uid, date: today,
        punchIn, punchOut, hours, status,
        correctedBy: adminName,
        correctionReason: reason.trim(),
        correctedAt: serverTimestamp(),
      });
      toast.success(`Attendance corrected for ${row.user.name}`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save correction');
    } finally {
      setSaving(false);
    }
  }

  const initials = row.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-black text-gray-900">Correct attendance</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-6 h-6 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center text-[10px] font-bold text-[#1B2B5E]">
                {initials}
              </div>
              <p className="text-sm text-gray-500">
                {row.user.name} · TC-{1042 + row.empIdx} · {dateLabel}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5">
            <X size={20}/>
          </button>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {/* Punch times */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Punch in
              </label>
              <input
                type="time" value={punchIn} onChange={e => setPunchIn(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono font-semibold text-gray-800
                  focus:outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                Punch out
              </label>
              <input
                type="time" value={punchOut} onChange={e => setPunchOut(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-mono font-semibold text-gray-800
                  focus:outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all"
              />
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Reason <span className="text-red-400 normal-case font-normal">(required — will be audit-logged)</span>
            </label>
            <textarea
              rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Biometric scanner skipped — verified by CCTV check at the Singapore office gate."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300
                focus:outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all resize-none"
            />
          </div>

          {/* Audit preview */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <div className="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0"/>
            <p className="text-xs text-gray-500 leading-relaxed">
              Edit will appear in audit log as{' '}
              <span className="font-bold text-gray-800">{row.user.name} edited attendance</span>
              {' '}with old and new values.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !reason.trim()}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl
                hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin"/>}
              Save correction
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAttendancePage() {
  const { currentUser } = useAuth();

  const [users,       setUsers]       = useState<ShipmateUser[]>([]);
  const [records,     setRecords]     = useState<Map<string, AttendanceRecord>>(new Map());
  const [onLeaveUids, setOnLeaveUids] = useState<Set<string>>(new Set());
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [statusFilter,setStatusFilter]= useState<StatusFilter>('all');
  const [correctRow,  setCorrectRow]  = useState<AttendanceRow | null>(null);
  const [refreshSecs, setRefreshSecs] = useState(0);
  const lastRefresh = useRef<Date>(new Date());

  const today = todayISO();

  // ── Firestore listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'active')),
      snap => {
        setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ShipmateUser)));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubAtt = onSnapshot(
      query(collection(db, 'attendance'), where('date', '==', today)),
      snap => {
        const m = new Map<string, AttendanceRecord>();
        snap.docs.forEach(d => {
          const r = d.data() as AttendanceRecord;
          m.set(r.uid, r);
        });
        setRecords(m);
        lastRefresh.current = new Date();
      }
    );

    // Leaves that overlap today — single-field query to avoid composite index
    // status + endDate filtered client-side
    const unsubLeaves = onSnapshot(
      query(
        collection(db, 'leaveRequests'),
        where('startDate', '<=', today)
      ),
      snap => {
        const uids = new Set<string>();
        snap.docs.forEach(d => {
          const l = d.data();
          if (l.status === 'approved' && l.endDate >= today)
            uids.add(l.employeeId as string);
        });
        setOnLeaveUids(uids);
      }
    );

    return () => { unsubUsers(); unsubAtt(); unsubLeaves(); };
  }, [today]);

  // ── Refresh ticker ───────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setRefreshSecs(Math.floor((Date.now() - lastRefresh.current.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Build rows ───────────────────────────────────────────────────────────────
  const rows: AttendanceRow[] = users.map((user, i) => {
    const record = records.get(user.uid) ?? null;
    let status: AttendanceStatus = 'missing';
    if (onLeaveUids.has(user.uid)) status = 'on_leave';
    else if (record) status = record.status;
    return { user, record, status, empIdx: i };
  });

  const counts: Record<AttendanceStatus, number> = {
    on_time: 0, late: 0, remote: 0, on_leave: 0, missing: 0,
  };
  rows.forEach(r => counts[r.status]++);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.user.name.toLowerCase().includes(q) || r.user.department.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = 'Employee,Department,TC,Punch In,Punch Out,Hours,Status,Corrected By';
    const csvRows = rows.map(r => [
      `"${r.user.name}"`,
      r.user.department,
      `TC-${1042 + r.empIdx}`,
      r.record?.punchIn  ?? '',
      r.record?.punchOut ?? '',
      r.record?.hours    ?? '',
      r.status,
      r.record?.correctedBy ?? '',
    ].join(','));
    const csv = [header, ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `attendance_${today}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
  });
  const refreshLabel = refreshSecs < 60
    ? `${refreshSecs} second${refreshSecs !== 1 ? 's' : ''}`
    : `${Math.floor(refreshSecs / 60)} min`;

  if (!currentUser) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Attendance</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {dateLabel} · Live ledger refreshed {refreshLabel} ago
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download size={14}/>Export CSV
            </button>
            {counts.missing > 0 && (
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5C518] text-[#1B2B5E] text-sm font-bold hover:bg-amber-300 transition-colors">
                <Bell size={14}/>Send punch reminders ({counts.missing})
              </button>
            )}
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(['on_time', 'late', 'remote', 'on_leave', 'missing'] as AttendanceStatus[]).map(s => {
            const cfg    = STATUS_CFG[s];
            const active = statusFilter === s;
            const cardLabel =
              s === 'on_time'   ? 'ON TIME' :
              s === 'on_leave'  ? 'ON LEAVE' :
              s === 'missing'   ? 'MISSING / ABSENT' :
              s.toUpperCase();
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? 'all' : s)}
                className={`bg-white rounded-2xl border p-5 text-left transition-all ${
                  active ? 'border-[#1B2B5E] shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={`w-2 h-2 rounded-full ${cfg.dot}`}/>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{cardLabel}</p>
                </div>
                <p className="text-4xl font-black text-gray-900 leading-none">{counts[s]}</p>
              </button>
            );
          })}
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100">

          {/* Toolbar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 flex-wrap">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 w-56">
              <Search size={14} className="text-gray-400 flex-shrink-0"/>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name..."
                className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {FILTER_LABELS.map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === v
                      ? 'bg-[#1B2B5E] text-white'
                      : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
              Live
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex items-center justify-center gap-3">
              <Loader2 size={22} className="text-[#1B2B5E] animate-spin"/>
              <span className="text-sm text-gray-400">Loading attendance…</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-3 py-3">Department</th>
                    <th className="px-3 py-3 text-center">Punch In</th>
                    <th className="px-3 py-3 text-center">Punch Out</th>
                    <th className="px-3 py-3 text-center">Hours</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(row => {
                    const cfg      = STATUS_CFG[row.status];
                    const initials = row.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <tr key={row.user.uid} className="hover:bg-gray-50/50 transition-colors group">

                        {/* Employee */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/8 flex items-center justify-center text-xs font-bold text-[#1B2B5E] flex-shrink-0 relative overflow-hidden">
                              {row.user.photoURL
                                ? <img src={row.user.photoURL} alt={row.user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                                : initials}
                              <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${cfg.dot}`}/>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900 leading-tight">{row.user.name}</p>
                              <p className="text-[11px] text-gray-400">TC-{1042 + row.empIdx} · {row.user.department}</p>
                            </div>
                          </div>
                        </td>

                        {/* Department */}
                        <td className="px-3 py-3.5">
                          <span className="text-sm text-gray-600 capitalize">{row.user.department.replace(/-/g, ' ')}</span>
                        </td>

                        {/* Punch In */}
                        <td className="px-3 py-3.5 text-center">
                          <span className="text-sm font-mono font-semibold text-gray-800">
                            {row.record?.punchIn ?? <span className="text-gray-300">—</span>}
                          </span>
                        </td>

                        {/* Punch Out */}
                        <td className="px-3 py-3.5 text-center">
                          <span className="text-sm font-mono font-semibold text-gray-800">
                            {row.record?.punchOut ?? <span className="text-gray-300">—</span>}
                          </span>
                        </td>

                        {/* Hours */}
                        <td className="px-3 py-3.5 text-center">
                          <span className="text-sm font-semibold text-gray-700">
                            {row.record?.hours ? `${row.record.hours}h` : <span className="text-gray-300">—</span>}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="px-3 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
                            {cfg.label}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="px-3 py-3.5">
                          <button
                            onClick={() => setCorrectRow(row)}
                            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-[#1B2B5E] transition-colors group-hover:text-gray-600"
                          >
                            <Edit2 size={12}/>Correct
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <Clock size={28} className="text-gray-200 mx-auto mb-2"/>
                        <p className="text-sm text-gray-400">No attendance records match your filter</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40 rounded-b-2xl flex items-center justify-between text-xs text-gray-400">
            <span>{rows.length} active employees · {today}</span>
            <span className="font-semibold text-gray-600">
              {counts.on_time} on time · {counts.late} late · {counts.missing} missing
            </span>
          </div>
        </div>

      </div>

      {/* ── Correction Modal ── */}
      {correctRow && (
        <CorrectionModal
          row={correctRow}
          adminName={currentUser.name}
          onClose={() => setCorrectRow(null)}
        />
      )}
    </div>
  );
}
