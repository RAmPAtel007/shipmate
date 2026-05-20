'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Download, Bell, Search, Edit2, X, Loader2, Clock, MapPin, SlidersHorizontal,
} from 'lucide-react';
import {
  collection, onSnapshot, query, where, doc, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import type { ShipmateUser } from '@/lib/types';
import { useDepartments } from '@/hooks/useDepartments';
import toast from 'react-hot-toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus = 'on_time' | 'late' | 'remote' | 'on_leave' | 'missing';
type StatusFilter = AttendanceStatus | 'all';

interface GeoPoint {
  lat: number;
  lng: number;
  accuracy: number;
}

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
  punchInLocation?: GeoPoint | null;
  punchOutLocation?: GeoPoint | null;
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
  // Late only if punch-in is at or after 11:00 AM
  return (h * 60 + m) >= 11 * 60 ? 'late' : 'on_time';
}

// ─── Location cell (shared by table + card) ───────────────────────────────────

function LocationLinks({ record }: { record: AttendanceRecord | null }) {
  if (!record) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {record.punchInLocation ? (
        <a
          href={`https://www.google.com/maps?q=${record.punchInLocation.lat},${record.punchInLocation.lng}`}
          target="_blank" rel="noopener noreferrer"
          title={`Punch In: ${record.punchInLocation.lat.toFixed(5)}, ${record.punchInLocation.lng.toFixed(5)}\nAccuracy: ±${Math.round(record.punchInLocation.accuracy)}m`}
          className="flex items-center gap-1 text-[11px] font-semibold text-green-600 hover:text-green-800 transition-colors"
        >
          <MapPin size={11} className="flex-shrink-0"/>
          <span className="font-mono">{record.punchInLocation.lat.toFixed(4)}°, {record.punchInLocation.lng.toFixed(4)}°</span>
        </a>
      ) : (
        <span className="flex items-center gap-1 text-[11px] text-gray-300">
          <MapPin size={11} className="flex-shrink-0"/><span>In: —</span>
        </span>
      )}
      {record.punchOutLocation ? (
        <a
          href={`https://www.google.com/maps?q=${record.punchOutLocation.lat},${record.punchOutLocation.lng}`}
          target="_blank" rel="noopener noreferrer"
          title={`Punch Out: ${record.punchOutLocation.lat.toFixed(5)}, ${record.punchOutLocation.lng.toFixed(5)}\nAccuracy: ±${Math.round(record.punchOutLocation.accuracy)}m`}
          className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:text-red-700 transition-colors"
        >
          <MapPin size={11} className="flex-shrink-0"/>
          <span className="font-mono">{record.punchOutLocation.lat.toFixed(4)}°, {record.punchOutLocation.lng.toFixed(4)}°</span>
        </a>
      ) : record.punchOut ? (
        <span className="flex items-center gap-1 text-[11px] text-gray-300">
          <MapPin size={11} className="flex-shrink-0"/><span>Out: —</span>
        </span>
      ) : null}
    </div>
  );
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
        punchInLocation:  row.record?.punchInLocation  ?? null,
        punchOutLocation: row.record?.punchOutLocation ?? null,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose}/>
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden">

        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full"/>
        </div>

        {/* Header */}
        <div className="px-5 pt-4 sm:pt-6 pb-4 flex items-start justify-between">
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5 p-1">
            <X size={20}/>
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Punch times */}
          <div className="grid grid-cols-2 gap-3">
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
              placeholder="e.g. Biometric scanner skipped — verified by CCTV."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300
                focus:outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all resize-none"
            />
          </div>

          {/* Audit preview */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-xl px-4 py-3">
            <div className="w-4 h-4 border-2 border-gray-300 rounded flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-gray-500 leading-relaxed">
              Edit will appear in audit log as{' '}
              <span className="font-bold text-gray-800">{row.user.name} edited attendance</span>
              {' '}with old and new values.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !reason.trim()}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl
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

// ─── Mobile Employee Card ─────────────────────────────────────────────────────

function EmployeeCard({ row, onCorrect }: { row: AttendanceRow; onCorrect: () => void }) {
  const { getDeptName } = useDepartments();
  const cfg      = STATUS_CFG[row.status];
  const initials = row.user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      {/* Top row: avatar + name + status */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1B2B5E]/8 flex items-center justify-center text-sm font-bold text-[#1B2B5E] flex-shrink-0 relative overflow-hidden">
          {row.user.photoURL
            ? <img src={row.user.photoURL} alt={row.user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
            : initials}
          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${cfg.dot}`}/>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{row.user.name}</p>
          <p className="text-[11px] text-gray-400">{getDeptName(row.user.department)}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
          {cfg.label}
        </span>
      </div>

      {/* Times row */}
      <div className="grid grid-cols-3 gap-2 bg-gray-50 rounded-xl px-3 py-2.5">
        <div className="text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">In</p>
          <p className="text-sm font-mono font-semibold text-gray-800">
            {row.record?.punchIn ?? <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className="text-center border-x border-gray-200">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Out</p>
          <p className="text-sm font-mono font-semibold text-gray-800">
            {row.record?.punchOut ?? <span className="text-gray-300">—</span>}
          </p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-0.5">Hours</p>
          <p className="text-sm font-semibold text-gray-700">
            {row.record?.hours ? `${row.record.hours}h` : <span className="text-gray-300">—</span>}
          </p>
        </div>
      </div>

      {/* Location + action row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <LocationLinks record={row.record}/>
        </div>
        <button
          onClick={onCorrect}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-[#1B2B5E] transition-colors flex-shrink-0 px-2.5 py-1.5 rounded-lg hover:bg-gray-100"
        >
          <Edit2 size={12}/>Correct
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAttendancePage() {
  const { currentUser } = useAuth();
  const { getDeptName } = useDepartments();

  const [users,        setUsers]        = useState<ShipmateUser[]>([]);
  const [records,      setRecords]      = useState<Map<string, AttendanceRecord>>(new Map());
  const [onLeaveUids,  setOnLeaveUids]  = useState<Set<string>>(new Set());
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [correctRow,   setCorrectRow]   = useState<AttendanceRow | null>(null);
  const [refreshSecs,  setRefreshSecs]  = useState(0);
  const [showFilters,  setShowFilters]  = useState(false);
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

    const unsubLeaves = onSnapshot(
      query(collection(db, 'leaveRequests'), where('startDate', '<=', today)),
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
    else if (record) {
      // Recompute on_time/late from punch-in time so stale stored values
      // don't override the current threshold (late = 11:00 AM+).
      if (record.punchIn && (record.status === 'on_time' || record.status === 'late')) {
        status = autoStatus(record.punchIn);
      } else {
        status = record.status;
      }
    }
    return { user, record, status, empIdx: i };
  });

  const counts: Record<AttendanceStatus, number> = {
    on_time: 0, late: 0, remote: 0, on_leave: 0, missing: 0,
  };
  rows.forEach(r => counts[r.status]++);

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.user.name.toLowerCase().includes(q) || getDeptName(r.user.department).toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // ── Export CSV ───────────────────────────────────────────────────────────────
  function exportCSV() {
    const header = 'Employee,Department,TC,Punch In,Punch Out,Hours,Status,Corrected By';
    const csvRows = rows.map(r => [
      `"${r.user.name}"`,
      getDeptName(r.user.department),
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
    ? `${refreshSecs}s`
    : `${Math.floor(refreshSecs / 60)}m`;

  if (!currentUser) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6 space-y-4 md:space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-black text-gray-900">Attendance</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-0.5">
              <span className="hidden sm:inline">{dateLabel} · </span>
              <span>Refreshed {refreshLabel} ago</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 md:px-4 md:py-2.5 rounded-xl border border-gray-200 bg-white text-xs md:text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download size={13}/>
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
            {counts.missing > 0 && (
              <button className="flex items-center gap-1.5 px-3 py-2 md:px-4 md:py-2.5 rounded-xl bg-[#F5C518] text-[#1B2B5E] text-xs md:text-sm font-bold hover:bg-amber-300 transition-colors">
                <Bell size={13}/>
                <span className="hidden sm:inline">Send reminders ({counts.missing})</span>
                <span className="sm:hidden">{counts.missing}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 md:gap-3">
          {(['on_time', 'late', 'remote', 'on_leave', 'missing'] as AttendanceStatus[]).map(s => {
            const cfg    = STATUS_CFG[s];
            const active = statusFilter === s;
            const cardLabel =
              s === 'on_time'  ? 'On Time' :
              s === 'on_leave' ? 'On Leave' :
              s === 'missing'  ? 'Missing' :
              s.charAt(0).toUpperCase() + s.slice(1);
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(active ? 'all' : s)}
                className={`bg-white rounded-xl md:rounded-2xl border p-3 md:p-5 text-left transition-all ${
                  active ? 'border-[#1B2B5E] shadow-md' : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
                } ${s === 'on_leave' || s === 'missing' ? 'col-span-1' : ''}`}
              >
                <div className="flex items-center gap-1 mb-1.5 md:mb-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`}/>
                  <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-wider truncate">{cardLabel}</p>
                </div>
                <p className="text-2xl md:text-4xl font-black text-gray-900 leading-none">{counts[s]}</p>
              </button>
            );
          })}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
            {/* Search */}
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 flex-1 md:w-56 md:flex-none">
              <Search size={14} className="text-gray-400 flex-shrink-0"/>
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search employees..."
                className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1 min-w-0"
              />
            </div>

            {/* Filter pills — hidden on mobile, shown on md+ */}
            <div className="hidden md:flex items-center gap-1.5">
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

            {/* Mobile filter toggle */}
            <button
              onClick={() => setShowFilters(v => !v)}
              className={`md:hidden flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                showFilters || statusFilter !== 'all'
                  ? 'bg-[#1B2B5E] text-white border-[#1B2B5E]'
                  : 'text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal size={13}/>
              {statusFilter !== 'all' ? STATUS_CFG[statusFilter as AttendanceStatus].label : 'Filter'}
            </button>

            <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-400 flex-shrink-0">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"/>
              <span className="hidden sm:inline">Live</span>
            </div>
          </div>

          {/* Mobile filter pills (collapsible) */}
          {showFilters && (
            <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-gray-50 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTER_LABELS.map(({ v, label }) => (
                <button
                  key={v}
                  onClick={() => { setStatusFilter(v); setShowFilters(false); }}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    statusFilter === v
                      ? 'bg-[#1B2B5E] text-white'
                      : 'text-gray-400 bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center gap-3">
              <Loader2 size={22} className="text-[#1B2B5E] animate-spin"/>
              <span className="text-sm text-gray-400">Loading attendance…</span>
            </div>
          ) : (
            <>
              {/* ── Desktop Table ── */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                      <th className="px-5 py-3">Employee</th>
                      <th className="px-3 py-3">Department</th>
                      <th className="px-3 py-3 text-center">Punch In</th>
                      <th className="px-3 py-3 text-center">Punch Out</th>
                      <th className="px-3 py-3 text-center">Hours</th>
                      <th className="px-3 py-3">Location</th>
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
                                <p className="text-[11px] text-gray-400">TC-{1042 + row.empIdx} · {getDeptName(row.user.department)}</p>
                              </div>
                            </div>
                          </td>

                          {/* Department */}
                          <td className="px-3 py-3.5">
                            <span className="text-sm text-gray-600">{getDeptName(row.user.department)}</span>
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

                          {/* Location */}
                          <td className="px-3 py-3.5">
                            <LocationLinks record={row.record}/>
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
                        <td colSpan={8} className="py-16 text-center">
                          <Clock size={28} className="text-gray-200 mx-auto mb-2"/>
                          <p className="text-sm text-gray-400">No attendance records match your filter</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ── Mobile Card List ── */}
              <div className="md:hidden divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock size={28} className="text-gray-200 mx-auto mb-2"/>
                    <p className="text-sm text-gray-400">No records match your filter</p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {filtered.map(row => (
                      <EmployeeCard
                        key={row.user.uid}
                        row={row}
                        onCorrect={() => setCorrectRow(row)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div className="px-4 md:px-5 py-3 border-t border-gray-50 bg-gray-50/40 rounded-b-2xl flex items-center justify-between text-xs text-gray-400 gap-2">
            <span>{rows.length} employees · {today}</span>
            <span className="font-semibold text-gray-600 text-right">
              {counts.on_time} on time · {counts.late} late · {counts.missing} absent
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
