'use client';

import { useEffect, useState, useMemo } from 'react';
import {
  Search, X, Pencil, Plus, Users, Building2,
  Trash2, Hash, UserMinus, Check, Download,
  Mail, Phone, MapPin, Calendar, Briefcase,
  Clock, FileText, DollarSign, User, ChevronDown,
  AlertCircle, Shield, Loader2, Eye, EyeOff,
} from 'lucide-react';
import {
  collection, deleteDoc, doc, setDoc, getDoc,
  updateDoc, serverTimestamp, query, where,
  onSnapshot, orderBy, limit, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { userService } from '@/lib/services/userService';
import { getRoleLabel } from '@/lib/utils/formatters';
import { createEmployeeAccount } from '@/lib/firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { ShipmateUser, UserRole, Department } from '@/lib/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptRecord {
  id: string;
  name: string;
  memberCount?: number;
}

interface WarehouseRecord {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  flag: string;
  address: string;
  code: string;
}

type DetailTab = 'profile' | 'attendance' | 'leave' | 'documents' | 'compensation' | 'tab-access';

const ROLES: UserRole[] = ['super_admin', 'hr_admin', 'manager', 'employee'];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7); // e.g. "2026-05"

// ─── Shipcube warehouse locations ─────────────────────────────────────────────

const WAREHOUSE_SEED: WarehouseRecord[] = [
  { id: 'nj',  name: 'New Jersey',    city: 'Secaucus',  state: 'NJ', country: 'US', flag: '🇺🇸', address: 'Secaucus, NJ',                        code: 'NJ' },
  { id: 'pa',  name: 'Pennsylvania',  city: 'Philadelphia', state: 'PA', country: 'US', flag: '🇺🇸', address: 'Philadelphia, PA',                  code: 'PA' },
  { id: 'ca',  name: 'California',    city: 'Fresno',    state: 'CA', country: 'US', flag: '🇺🇸', address: '2894 S Orange Ave, Fresno, CA 93725',  code: 'CA' },
  { id: 'tx',  name: 'Texas',         city: 'Dallas',    state: 'TX', country: 'US', flag: '🇺🇸', address: 'Dallas, TX',                          code: 'TX' },
  { id: 'uae', name: 'Dubai',         city: 'Dubai',     state: '',   country: 'AE', flag: '🇦🇪', address: 'Dubai, UAE',                          code: 'UAE' },
];

// ─── Avatar color helpers ─────────────────────────────────────────────────────

const AVATAR_PALETTES = [
  { bg: 'bg-[#6366F1]', text: 'text-white' },
  { bg: 'bg-[#EC4899]', text: 'text-white' },
  { bg: 'bg-[#10B981]', text: 'text-white' },
  { bg: 'bg-[#F59E0B]', text: 'text-white' },
  { bg: 'bg-[#3B82F6]', text: 'text-white' },
  { bg: 'bg-[#8B5CF6]', text: 'text-white' },
  { bg: 'bg-[#EF4444]', text: 'text-white' },
  { bg: 'bg-[#06B6D4]', text: 'text-white' },
  { bg: 'bg-[#84CC16]', text: 'text-gray-800' },
  { bg: 'bg-[#F97316]', text: 'text-white' },
];

function avatarPalette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function titleCase(str: string) {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function last7Dates() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    active:      'bg-green-100 text-green-700',
    inactive:    'bg-gray-100 text-gray-500',
    on_leave:    'bg-amber-100 text-amber-700',
    onboarding:  'bg-blue-100 text-blue-700',
    offboarding: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${cfg[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status?.replace('_', ' ') ?? 'inactive'}
    </span>
  );
}

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  user, empIdx, selected, onClick,
}: {
  user: ShipmateUser; empIdx: number; selected: boolean; onClick: () => void;
}) {
  const pal = avatarPalette(user.name);
  const tcId = (user as any).tcId ?? `TC-${1042 + empIdx}`;
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border p-5 hover:shadow-md transition-all w-full ${
        selected ? 'border-[#1B2B5E] shadow-md ring-1 ring-[#1B2B5E]/20' : 'border-gray-100 hover:border-gray-200'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-12 h-12 rounded-full ${pal.bg} flex items-center justify-center flex-shrink-0 overflow-hidden`}>
          {user.photoURL
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
            : <span className={`text-sm font-bold ${pal.text}`}>{initials(user.name)}</span>
          }
        </div>
        <StatusBadge status={(user as any).status ?? 'active'}/>
      </div>
      <p className="font-bold text-gray-900 text-sm leading-tight">{user.name}</p>
      <p className="text-xs text-gray-500 mt-0.5 truncate">
        {(user as any).jobTitle ?? getRoleLabel(user.role)}
      </p>
      <div className="mt-3 space-y-1">
        <p className="text-[11px] text-gray-400">
          {tcId} · {user.department ? titleCase(user.department) : '—'}
        </p>
        {(user as any).location && (
          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <MapPin size={10}/>{(user as any).location}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Tab: Profile ─────────────────────────────────────────────────────────────

function ProfileTab({ user, users }: { user: ShipmateUser; users: ShipmateUser[] }) {
  const u = user as any;
  const manager = users.find(m => m.uid === u.managerId);
  const rows = (label: string, val: string | undefined, icon?: React.ReactNode) =>
    val ? (
      <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
        <span className="text-xs text-gray-400 flex items-center gap-1.5">{icon}{label}</span>
        <span className="text-xs font-semibold text-gray-800 text-right max-w-[60%]">{val}</span>
      </div>
    ) : null;

  return (
    <div className="p-5 space-y-5">
      {/* Contact */}
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Contact</p>
        <div className="bg-gray-50 rounded-xl px-4">
          {rows('Work email', u.email, <Mail size={11}/>)}
          {rows('Phone', u.phone, <Phone size={11}/>)}
          {rows('Location', u.location, <MapPin size={11}/>)}
          {!u.email && !u.phone && !u.location && (
            <p className="py-3 text-xs text-gray-400">No contact info added</p>
          )}
        </div>
      </section>

      {/* Emergency Contact */}
      {u.emergencyContact && (
        <section>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Emergency Contact</p>
          <div className="bg-gray-50 rounded-xl px-4">
            {rows('Name', u.emergencyContact?.name)}
            {rows('Phone', u.emergencyContact?.phone, <Phone size={11}/>)}
            {rows('Relationship', u.emergencyContact?.relationship)}
          </div>
        </section>
      )}

      {/* Employment */}
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Employment</p>
        <div className="bg-gray-50 rounded-xl px-4">
          {rows('Employee ID', (u.tcId ?? `TC-${1042}`), <Hash size={11}/>)}
          {rows('Job Title', u.jobTitle, <Briefcase size={11}/>)}
          {rows('Department', u.department ? titleCase(u.department) : undefined, <Building2 size={11}/>)}
          {rows('Role', getRoleLabel(user.role), <Shield size={11}/>)}
          {rows('Joining Date', u.joinDate ?? u.joinedAt, <Calendar size={11}/>)}
          {rows('Manager', manager?.name, <User size={11}/>)}
        </div>
      </section>
    </div>
  );
}

// ─── Tab: Attendance ──────────────────────────────────────────────────────────

function AttendanceTab({ user }: { user: ShipmateUser }) {
  const [records, setRecords] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setRecords({});
    // Single-field query only (no composite index needed)
    // Filter to last-30 days client-side so we have enough history
    const cutoff = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); })();
    const unsub = onSnapshot(
      query(collection(db, 'attendance'), where('uid', '==', user.uid)),
      snap => {
        const m: Record<string, any> = {};
        snap.docs.forEach(d => { const r = d.data(); if (r.date >= cutoff) m[r.date] = r; });
        setRecords(m);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [user.uid]);

  const dates = last7Dates();
  const withRecord = dates.filter(d => records[d]);
  const onTimeCount = withRecord.filter(d => records[d].status === 'on_time').length;
  const onTimePct = withRecord.length ? Math.round((onTimeCount / withRecord.length) * 100) : 0;

  const avgIn = (() => {
    const times = withRecord.map(d => records[d].punchIn).filter(Boolean);
    if (!times.length) return '—';
    const mins = times.map(t => { const [h,m] = t.split(':').map(Number); return h*60+m; });
    const avg = Math.round(mins.reduce((a,b) => a+b, 0) / mins.length);
    return `${String(Math.floor(avg/60)).padStart(2,'0')}:${String(avg%60).padStart(2,'0')}`;
  })();

  const totalOT = withRecord.reduce((sum, d) => sum + (records[d].otHours ?? 0), 0);

  const statusCfg: Record<string, string> = {
    on_time:  'bg-green-100 text-green-700',
    late:     'bg-amber-100 text-amber-700',
    remote:   'bg-blue-100 text-blue-700',
    on_leave: 'bg-violet-100 text-violet-700',
    missing:  'bg-red-100 text-red-600',
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-300"/></div>;

  return (
    <div className="p-5 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'ON TIME', val: `${onTimePct}%`, color: 'text-green-600' },
          { label: 'AVG IN', val: avgIn, color: 'text-gray-800' },
          { label: 'OVERTIME', val: `${totalOT}h`, color: 'text-amber-600' },
        ].map(s => (
          <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-xl font-black ${s.color}`}>{s.val}</p>
            {s.label === 'OVERTIME' && <p className="text-[10px] text-gray-400">this month</p>}
          </div>
        ))}
      </div>

      {/* Last 7 days */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Last 7 Days</p>
        <div className="space-y-1">
          {dates.map(date => {
            const r = records[date];
            const d = new Date(date);
            const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            if (!r) {
              return (
                <div key={date} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-gray-50/50">
                  <span className="text-xs text-gray-400">{dayLabel}</span>
                  <span className="text-[11px] text-gray-300">No record</span>
                </div>
              );
            }
            return (
              <div key={date} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-gray-50">
                <span className="text-xs font-medium text-gray-700 w-24 flex-shrink-0">{dayLabel}</span>
                <span className="text-xs font-mono text-gray-600">{r.punchIn ?? '—'}</span>
                <span className="text-xs font-mono text-gray-600">{r.punchOut ?? <span className="text-gray-300">in progress</span>}</span>
                <span className="text-xs text-gray-500">{r.hours ? `${r.hours}h` : '—'}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusCfg[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {r.status === 'on_time' ? 'On time' : r.status === 'late' ? `Late` : r.status?.replace('_', ' ')}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Leave ───────────────────────────────────────────────────────────────

function LeaveTab({ user }: { user: ShipmateUser }) {
  const [balance, setBalance]       = useState<any>(null);
  const [requests, setRequests]     = useState<any[]>([]);
  const [balLoading, setBalLoading] = useState(true);
  const [reqLoading, setReqLoading] = useState(true);
  const loading = balLoading || reqLoading;

  useEffect(() => {
    setBalLoading(true);
    setReqLoading(true);
    setBalance(null);
    setRequests([]);

    const unsubBal = onSnapshot(
      doc(db, 'leaveBalances', user.uid),
      snap => { setBalance(snap.exists() ? snap.data() : null); setBalLoading(false); },
      () => setBalLoading(false),
    );

    const unsubReq = onSnapshot(
      query(collection(db, 'leaveRequests'), where('employeeId', '==', user.uid)),
      snap => {
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.startDate > a.startDate ? 1 : -1))
          .slice(0, 10);
        setRequests(sorted);
        setReqLoading(false);
      },
      () => setReqLoading(false),
    );

    return () => { unsubBal(); unsubReq(); };
  }, [user.uid]);

  const statusColor: Record<string, string> = {
    approved: 'bg-green-100 text-green-700',
    pending:  'bg-amber-100 text-amber-700',
    rejected: 'bg-red-100 text-red-600',
    cancelled:'bg-gray-100 text-gray-500',
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-300"/></div>;

  return (
    <div className="p-5 space-y-5">
      {/* Balance */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Balance</p>
        {balance ? (
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'earned',   label: 'Paid',    alloc: 24 },
              { key: 'medical',  label: 'Sick',    alloc: 12 },
              { key: 'casual',   label: 'Casual',  alloc: 8  },
            ].map(({ key, label, alloc }) => {
              const b = balance[key];
              const used = b?.used ?? 0;
              const total = b?.allocated ?? alloc;
              const remaining = total - used;
              return (
                <div key={key} className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                  <p className="text-2xl font-black text-gray-900 mt-1">{remaining}</p>
                  <p className="text-[11px] text-gray-400">of {total}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400">No leave balance configured</p>
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">History</p>
        {requests.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No leave requests found</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-800 capitalize">
                    {r.leaveType?.replace('_', ' ') ?? r.type ?? 'Leave'} · {r.days ?? '—'}d
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{r.startDate} {r.endDate && r.endDate !== r.startDate ? `→ ${r.endDate}` : ''}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full capitalize ${statusColor[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: Documents ───────────────────────────────────────────────────────────

function DocumentsTab({ user }: { user: ShipmateUser }) {
  const [byEmpId, setByEmpId]     = useState<Record<string, any>>({});
  const [byUploader, setByUploader] = useState<Record<string, any>>({});
  const [empLoading, setEmpLoading] = useState(true);
  const [uplLoading, setUplLoading] = useState(true);
  const loading = empLoading || uplLoading;
  const docs = Object.values({ ...byUploader, ...byEmpId }); // empId wins on conflict

  useEffect(() => {
    setEmpLoading(true);
    setUplLoading(true);
    setByEmpId({});
    setByUploader({});

    const unsubE = onSnapshot(
      query(collection(db, 'documents'), where('employeeId', '==', user.uid)),
      snap => {
        const m: Record<string, any> = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setByEmpId(m);
        setEmpLoading(false);
      },
      () => setEmpLoading(false),
    );
    const unsubU = onSnapshot(
      query(collection(db, 'documents'), where('uploadedBy', '==', user.uid)),
      snap => {
        const m: Record<string, any> = {};
        snap.docs.forEach(d => { m[d.id] = { id: d.id, ...d.data() }; });
        setByUploader(m);
        setUplLoading(false);
      },
      () => setUplLoading(false),
    );
    return () => { unsubE(); unsubU(); };
  }, [user.uid]);

  const extIcon: Record<string, string> = {
    pdf: 'bg-red-500', jpg: 'bg-green-500', jpeg: 'bg-green-500',
    png: 'bg-green-500', docx: 'bg-blue-500', xlsx: 'bg-emerald-500',
  };

  function fmtSize(bytes: number) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) return <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-300"/></div>;

  return (
    <div className="p-5">
      {docs.length === 0 ? (
        <div className="text-center py-10">
          <FileText size={28} className="text-gray-200 mx-auto mb-2"/>
          <p className="text-sm text-gray-400">No documents uploaded</p>
          <p className="text-xs text-gray-300 mt-1">Documents uploaded for this employee will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d: any) => {
            const ext = d.name?.split('.').pop()?.toLowerCase() ?? 'file';
            const iconBg = extIcon[ext] ?? 'bg-gray-500';
            return (
              <div key={d.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
                  <span className="text-white text-[10px] font-black uppercase">{ext.slice(0,3)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{d.name ?? 'Document'}</p>
                  <p className="text-[11px] text-gray-400">
                    {fmtSize(d.size)} {d.uploadedAt?.toDate ? ` · uploaded ${d.uploadedAt.toDate().toLocaleDateString('en-GB')}` : ''}
                  </p>
                </div>
                {d.url && (
                  <a href={d.url} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#1B2B5E] hover:text-[#2D4080] transition-colors flex-shrink-0">
                    <Download size={13}/>Download
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Compensation ────────────────────────────────────────────────────────

function CompensationTab({ user }: { user: ShipmateUser }) {
  const [profile, setProfile]         = useState<any>(null);
  const [entry, setEntry]             = useState<any>(null);
  const [profLoading, setProfLoading] = useState(true);
  const [entLoading, setEntLoading]   = useState(true);
  const loading = profLoading || entLoading;

  useEffect(() => {
    setProfLoading(true);
    setEntLoading(true);
    setProfile(null);
    setEntry(null);

    const unsubP = onSnapshot(
      doc(db, 'payrollProfiles', user.uid),
      snap => { setProfile(snap.exists() ? snap.data() : null); setProfLoading(false); },
      () => setProfLoading(false),
    );

    // Single-field query — no composite index needed; filter month client-side
    const unsubE = onSnapshot(
      query(collection(db, 'payrollEntries'), where('uid', '==', user.uid)),
      snap => {
        const match = snap.docs.find(d => d.data().month === CURRENT_MONTH);
        setEntry(match ? match.data() : null);
        setEntLoading(false);
      },
      () => setEntLoading(false),
    );

    return () => { unsubP(); unsubE(); };
  }, [user.uid]);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-300"/></div>;

  if (!profile) return (
    <div className="p-8 text-center">
      <DollarSign size={28} className="text-gray-200 mx-auto mb-2"/>
      <p className="text-sm text-gray-400">No payroll profile configured</p>
      <p className="text-xs text-gray-300 mt-1">Set up in Admin → Payroll</p>
    </div>
  );

  const isUS = profile.country === 'US';
  const fmt = (n: number) => isUS ? `$${n?.toLocaleString('en-US')}` : `₹${n?.toLocaleString('en-IN')}`;

  // Compute gross & net (simplified)
  const gross = isUS
    ? (profile.baseSalary ?? 0) + (entry?.otPay ?? 0) + (entry?.adjustments ?? 0)
    : (profile.basic ?? 0) + (profile.hra ?? 0) + (profile.specialAllowance ?? 0)
      + Math.round((profile.lta ?? 0) / 12) + (profile.medical ?? 0)
      + (entry?.otPay ?? 0) + (entry?.adjustments ?? 0);

  const Row = ({ label, val }: { label: string; val: string }) => (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0 text-xs">
      <span className="text-gray-500">{label}</span>
      <span className="font-semibold text-gray-800">{val}</span>
    </div>
  );

  return (
    <div className="p-5 space-y-5">
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Salary Structure</p>
        <div className="bg-gray-50 rounded-xl px-4">
          {isUS ? (
            <>
              <Row label="Base salary" val={`${fmt(profile.baseSalary * 12)} / yr`}/>
              <Row label="Monthly gross" val={fmt(profile.baseSalary)}/>
              <Row label="State" val={profile.usState ?? '—'}/>
              <Row label="401(k)" val={`${profile.k401Pct ?? 0}%`}/>
              <Row label="Health insurance" val={`${fmt(profile.healthIns ?? 0)} / mo`}/>
            </>
          ) : (
            <>
              <Row label="Basic salary" val={`${fmt(profile.basic)} / mo`}/>
              <Row label="HRA" val={fmt(profile.hra ?? 0)}/>
              <Row label="Special allowance" val={fmt(profile.specialAllowance ?? 0)}/>
              <Row label="LTA" val={`${fmt(profile.lta ?? 0)} / yr`}/>
              <Row label="PF applicable" val={profile.pfApplicable ? `Yes (${profile.pfRate ?? 12}%)` : 'No'}/>
              <Row label="State" val={profile.inState ?? '—'}/>
            </>
          )}
        </div>
      </section>

      {/* Last payslip */}
      <section>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
          Last Payslip — {CURRENT_MONTH}
        </p>
        {entry ? (
          <div className="bg-[#1B2B5E] rounded-2xl p-4">
            <div className="flex justify-between text-xs text-white/60 mb-1">
              <span>Gross</span>
              <span>{fmt(gross)}</span>
            </div>
            {(entry.otPay > 0) && (
              <div className="flex justify-between text-xs text-white/60 mb-1">
                <span>OT ({entry.otHours}h)</span>
                <span>{fmt(entry.otPay)}</span>
              </div>
            )}
            <div className="border-t border-white/10 mt-2 pt-2 flex justify-between">
              <span className="text-white font-bold text-sm">Net Pay</span>
              <span className="text-white font-black text-lg">{fmt(gross)}</span>
            </div>
            <p className="text-white/30 text-[10px] mt-1">Status: {entry.status ?? 'Pending'}</p>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-400">No payroll entry for {CURRENT_MONTH}</p>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Employee Detail Panel ────────────────────────────────────────────────────

function EmployeeDetailPanel({
  user, users, empIdx, onClose, onEdit, onDeleted,
}: {
  user: ShipmateUser; users: ShipmateUser[]; empIdx: number;
  onClose: () => void; onEdit: () => void; onDeleted: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('profile');
  const [resetSending, setResetSending] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', user.uid));
      toast.success(`${user.name} has been deleted`);
      onDeleted();
      onClose();
    } catch {
      toast.error('Failed to delete employee');
      setDeleting(false);
    }
  }

  async function handleSendReset() {
    if (!user.email) return;
    setResetSending(true);
    try {
      const { sendPasswordReset } = await import('@/lib/firebase/auth');
      await sendPasswordReset(user.email);
      toast.success(`Password reset email sent to ${user.email}`);
    } catch {
      toast.error('Failed to send reset email');
    } finally {
      setResetSending(false);
    }
  }
  const pal = avatarPalette(user.name);
  const tcId = (user as any).tcId ?? `TC-${1042 + empIdx}`;
  const joinDate = (user as any).joinDate ?? (user as any).joinedAt;

  const tabs: { id: DetailTab; label: string; shortLabel: string }[] = [
    { id: 'profile',      label: 'Profile',      shortLabel: 'Profile' },
    { id: 'attendance',   label: 'Attendance',   shortLabel: 'Attend.' },
    { id: 'leave',        label: 'Leave',        shortLabel: 'Leave' },
    { id: 'documents',    label: 'Documents',    shortLabel: 'Docs' },
    { id: 'compensation', label: 'Compensation', shortLabel: 'Pay' },
    { id: 'tab-access',   label: 'Tab Access',   shortLabel: 'Access' },
  ];

  return (
    <div className="relative w-full max-w-md h-full bg-white flex flex-col border-l border-gray-100 overflow-hidden">

      {/* Header */}
      <div className="bg-[#1B2B5E] px-5 pt-5 pb-4 flex-shrink-0">
        {/* Top row: avatar + actions */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-white/20`}>
              {user.photoURL
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                : <span className={`text-sm font-bold ${pal.text}`}>{initials(user.name)}</span>
              }
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-tight truncate">{user.name}</p>
              <p className="text-white/55 text-[11px] mt-0.5 truncate">
                {(user as any).jobTitle ?? getRoleLabel(user.role)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={onEdit}
              className="flex items-center gap-1 text-white/70 hover:text-white text-[11px] font-semibold transition-colors bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg">
              <Pencil size={11}/>Edit
            </button>
            <button
              onClick={handleSendReset}
              disabled={resetSending}
              title={`Send password reset to ${user.email}`}
              className="flex items-center gap-1 text-white/70 hover:text-white text-[11px] font-semibold transition-colors bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg disabled:opacity-50"
            >
              {resetSending ? <Loader2 size={11} className="animate-spin"/> : <Mail size={11}/>}
              <span>Pwd</span>
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              title="Delete employee"
              className="flex items-center gap-1 text-red-300 hover:text-white text-[11px] font-semibold transition-colors bg-red-500/20 hover:bg-red-500/50 px-2.5 py-1.5 rounded-lg"
            >
              <Trash2 size={11}/>
            </button>
            <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <X size={16}/>
            </button>
          </div>
        </div>
        {/* Sub-info row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-white/40 bg-white/10 px-2 py-0.5 rounded-md font-mono">{tcId}</span>
          {user.department && (
            <span className="text-[11px] text-white/50 flex items-center gap-1">
              <Building2 size={10} className="text-white/30"/>
              {titleCase(user.department)}
            </span>
          )}
          <StatusBadge status={(user as any).status ?? 'active'}/>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 flex-shrink-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 min-w-0 px-2 py-2.5 text-[11px] font-semibold whitespace-nowrap transition-all border-b-2 ${
              tab === t.id
                ? 'border-[#1B2B5E] text-[#1B2B5E] bg-[#1B2B5E]/5'
                : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'profile'      && <ProfileTab user={user} users={users}/>}
        {tab === 'attendance'   && <AttendanceTab user={user}/>}
        {tab === 'leave'        && <LeaveTab user={user}/>}
        {tab === 'documents'    && <DocumentsTab user={user}/>}
        {tab === 'compensation' && <CompensationTab user={user}/>}
        {tab === 'tab-access'   && <TabAccessTab user={user}/>}
      </div>

      {/* Delete confirm overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/60 z-20 flex items-end justify-center">
          <div className="w-full bg-white rounded-t-2xl p-5 shadow-2xl">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-3 mx-auto">
              <Trash2 size={18} className="text-red-500"/>
            </div>
            <p className="text-sm font-bold text-gray-900 text-center mb-1">Delete {user.name}?</p>
            <p className="text-xs text-gray-500 text-center mb-4">
              This permanently removes their account and cannot be undone. Their chat history and leave records will remain.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 size={13} className="animate-spin"/> : <Trash2 size={13}/>}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
            <div className="h-2"/>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab Access Manager (top-level page tab) ─────────────────────────────────

function TabAccessManager({ users }: { users: ShipmateUser[] }) {
  const [saving, setSaving] = useState<string | null>(null); // "uid:key"
  const [search, setSearch] = useState('');

  const employees = users.filter(u =>
    !['super_admin', 'hr_admin'].includes(u.role) &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  const TABS_CONFIG = [
    { key: 'chat',      label: 'Chat',      icon: '💬' },
    { key: 'payslip',   label: 'Payslip',   icon: '💰' },
    { key: 'people',    label: 'People',    icon: '👥' },
    { key: 'documents', label: 'Documents', icon: '📁' },
  ];

  async function toggle(user: ShipmateUser, key: string) {
    const current = ((user as any).tabAccess ?? {})[key] === true;
    const id = `${user.uid}:${key}`;
    setSaving(id);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`tabAccess.${key}`]: !current,
        updatedAt: serverTimestamp(),
      });
      toast.success(`${key} ${!current ? 'enabled' : 'disabled'} for ${user.name}`);
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold text-gray-800">Tab Access Control</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Default tabs (Dashboard, Attendance, Calendar, Leaves, Settings) are always visible.
            Toggle optional tabs per employee below.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 w-full sm:w-56">
          <Search size={14} className="text-gray-400 flex-shrink-0"/>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"
          />
          {search && <button onClick={() => setSearch('')}><X size={12} className="text-gray-400"/></button>}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {/* Column headers */}
        <div className="grid border-b border-gray-100 bg-gray-50/60"
          style={{ gridTemplateColumns: '1fr repeat(4, 100px)' }}>
          <div className="px-5 py-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider">Employee</div>
          {TABS_CONFIG.map(t => (
            <div key={t.key} className="py-3 text-center text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              {t.icon} {t.label}
            </div>
          ))}
        </div>

        {/* Rows */}
        {employees.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {search ? 'No employees match your search' : 'No employees found'}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {employees.map(user => {
              const access = (user as any).tabAccess ?? {};
              const pal = avatarPalette(user.name);
              return (
                <div key={user.uid} className="grid items-center hover:bg-gray-50/50 transition-colors"
                  style={{ gridTemplateColumns: '1fr repeat(4, 100px)' }}>
                  {/* Name */}
                  <div className="px-5 py-3.5 flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                      {user.photoURL
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                        : <span className={`text-[10px] font-bold ${pal.text}`}>{initials(user.name)}</span>
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {user.department ? titleCase(user.department) : '—'} · {getRoleLabel(user.role)}
                      </p>
                    </div>
                  </div>

                  {/* Toggle per tab */}
                  {TABS_CONFIG.map(({ key }) => {
                    const enabled = access[key] === true;
                    const isSaving = saving === `${user.uid}:${key}`;
                    return (
                      <div key={key} className="flex items-center justify-center py-3">
                        <button
                          onClick={() => toggle(user, key)}
                          disabled={!!isSaving}
                          className={`relative w-10 h-[22px] rounded-full transition-colors ${
                            enabled ? 'bg-[#1B2B5E]' : 'bg-gray-200'
                          }`}
                        >
                          {isSaving ? (
                            <Loader2 size={11} className="absolute inset-0 m-auto animate-spin text-white"/>
                          ) : (
                            <span className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow transition-transform ${
                              enabled ? 'translate-x-[20px]' : 'translate-x-[2px]'
                            }`}/>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 text-center">
        Changes take effect on the employee&apos;s next page load. Admins always see all tabs.
      </p>
    </div>
  );
}

// ─── Tab Access Tab ───────────────────────────────────────────────────────────

const OPTIONAL_TABS: { key: string; label: string; description: string; icon: string }[] = [
  { key: 'chat',      label: 'Chat',      description: 'Team messaging and direct messages',     icon: '💬' },
  { key: 'payslip',   label: 'Payslip',   description: 'View monthly payslips and salary info',  icon: '💰' },
  { key: 'people',    label: 'People',    description: 'Browse the employee directory',           icon: '👥' },
  { key: 'documents', label: 'Documents', description: 'Access shared files and documents',      icon: '📁' },
];

const DEFAULT_TAB_LABELS = ['Dashboard', 'Attendance', 'Team Calendar', 'Leaves', 'Settings'];

function TabAccessTab({ user }: { user: ShipmateUser }) {
  // Sync local state whenever the user prop updates (parent onSnapshot fires)
  const [access, setAccess] = useState<Record<string, boolean>>(
    (user as any).tabAccess ?? {}
  );
  useEffect(() => {
    setAccess((user as any).tabAccess ?? {});
  }, [user]);
  const [saving, setSaving] = useState<string | null>(null);
  const isAdminUser = ['super_admin', 'hr_admin'].includes(user.role);

  async function toggle(key: string) {
    const next = !access[key];
    setSaving(key);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        [`tabAccess.${key}`]: next,
        updatedAt: serverTimestamp(),
      });
      setAccess(prev => ({ ...prev, [key]: next }));
      toast.success(`${key} tab ${next ? 'enabled' : 'disabled'} for ${user.name}`);
    } catch {
      toast.error('Failed to update tab access');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-5 space-y-5">
      {/* Default tabs (locked) */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          Default Tabs — Always Visible
        </p>
        <div className="space-y-2">
          {DEFAULT_TAB_LABELS.map(label => (
            <div key={label} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </div>
              <span className="text-[11px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                Always on
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Optional tabs */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
          Optional Tabs — Admin Controlled
        </p>
        {isAdminUser && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mb-3">
            This user is an admin and always sees all tabs.
          </p>
        )}
        <div className="space-y-2">
          {OPTIONAL_TABS.map(({ key, label, description, icon }) => {
            const enabled = access[key] === true;
            const isSaving = saving === key;
            return (
              <div key={key} className={`flex items-center justify-between py-3 px-3 rounded-xl border transition-colors ${
                enabled ? 'bg-[#1B2B5E]/3 border-[#1B2B5E]/10' : 'bg-white border-gray-100'
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className="text-lg leading-none">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-[11px] text-gray-400">{description}</p>
                  </div>
                </div>
                <button
                  onClick={() => !isAdminUser && toggle(key)}
                  disabled={isSaving || isAdminUser}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    isAdminUser ? 'opacity-40 cursor-not-allowed' :
                    enabled ? 'bg-[#1B2B5E]' : 'bg-gray-200'
                  }`}
                >
                  {isSaving ? (
                    <Loader2 size={12} className="absolute inset-0 m-auto animate-spin text-white"/>
                  ) : (
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}/>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-gray-400 text-center pt-1">
        Changes take effect immediately on the employee&apos;s next page load.
      </p>
    </div>
  );
}

// ─── Keep existing modals (unchanged) ─────────────────────────────────────────

const DEPT_GRADIENTS = [
  'from-blue-500 to-blue-600', 'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600', 'from-rose-500 to-rose-600',
  'from-amber-500 to-amber-600', 'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600', 'from-pink-500 to-pink-600',
];

function AddDeptModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  function toSlug(s: string) { return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''); }
  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Department name is required'); return; }
    const slug = toSlug(trimmed);
    if (!slug) { toast.error('Name must contain letters or numbers'); return; }
    setSaving(true);
    try {
      const deptRef = doc(db, 'departments', slug);
      const existing = await getDoc(deptRef);
      if (existing.exists()) { toast.error('Department already exists'); setSaving(false); return; }
      await setDoc(deptRef, { name: trimmed, slug, memberCount: 0, createdAt: serverTimestamp() });
      toast.success(`"${trimmed}" created`);
      onAdded(); onClose();
    } catch { toast.error('Failed to create department'); }
    finally { setSaving(false); }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#F5C518]/20 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-[#F5C518]"/>
            </div>
            <h2 className="text-white font-bold text-sm">New Department</h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X size={16}/></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Department Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Operations, Design, Sales…" maxLength={40} autoFocus
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] transition-all"/>
            {name.trim() && (
              <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                <Hash size={10}/>ID: <span className="font-mono text-[#1B2B5E]">{toSlug(name)}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2.5 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50 transition-colors">
              {saving ? 'Creating…' : 'Create Department'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Stable input row — must live at module level so React never remounts it ────
function InputRow({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
      />
    </div>
  );
}

function EditModal({ user, departments, onClose, onSaved }: {
  user: ShipmateUser; departments: DeptRecord[]; onClose: () => void; onSaved: () => void;
}) {
  const [role, setRole]         = useState<UserRole>(user.role);
  const [dept, setDept]         = useState<string>(user.department ?? '');
  const [status, setStatus]     = useState<'active'|'inactive'>((user as any).status ?? 'active');
  const [jobTitle, setJobTitle] = useState<string>((user as any).jobTitle ?? '');
  const [phone, setPhone]       = useState<string>((user as any).phone ?? '');
  const [location, setLocation] = useState<string>((user as any).location ?? '');
  const [joinDate, setJoinDate] = useState<string>((user as any).joinDate ?? '');
  const [tcId, setTcId]         = useState<string>((user as any).tcId ?? '');
  const [warehouseId, setWarehouseId] = useState<string>((user as any).warehouseId ?? '');
  const [saving, setSaving]     = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role,
        department: dept as any,
        status,
        jobTitle,
        phone,
        location,
        joinDate,
        warehouseId,
        ...(tcId.trim() ? { tcId: tcId.trim() } : {}),
        updatedAt: serverTimestamp(),
      });
      toast.success('Employee updated');
      onSaved(); onClose();
    } catch { toast.error('Failed to update'); }
    finally { setSaving(false); }
  }

  const pal = avatarPalette(user.name);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden`}>
              {user.photoURL
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                : <span className={`text-xs font-bold ${pal.text}`}>{initials(user.name)}</span>
              }
            </div>
            <div>
              <p className="text-white font-bold text-sm">{user.name}</p>
              <p className="text-white/50 text-xs">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X size={16}/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="on_leave">On Leave</option>
                <option value="onboarding">Onboarding</option>
                <option value="offboarding">Offboarding</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Department</label>
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                <option value="">— Unassigned —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Warehouse</label>
              <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                <option value="">— Not assigned —</option>
                {WAREHOUSE_SEED.map(w => (
                  <option key={w.id} value={w.id}>{w.flag} {w.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <InputRow label="Job Title" value={jobTitle} onChange={setJobTitle} placeholder="e.g. Software Engineer" />
            <InputRow label="Employee ID" value={tcId} onChange={setTcId} placeholder="e.g. TC-1042" />
          </div>
          <InputRow label="Phone" value={phone} onChange={setPhone} type="tel" placeholder="+1 000 000 0000" />
          <InputRow label="Location / City" value={location} onChange={setLocation} placeholder="e.g. New York" />
          <InputRow label="Joining Date" value={joinDate} onChange={setJoinDate} type="date" />
        </div>
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-60">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, allDepts, onChangeRole, onMoveToDept, onRemove }: {
  member: ShipmateUser; allDepts: DeptRecord[];
  onChangeRole: (role: UserRole) => void; onMoveToDept: (deptId: string) => void; onRemove: () => void;
}) {
  const pal = avatarPalette(member.name);
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
      <div className={`w-8 h-8 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
        {member.photoURL
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
          : <span className={`text-[10px] font-bold ${pal.text}`}>{initials(member.name)}</span>
        }
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{member.name}</p>
        <p className="text-xs text-gray-400 truncate">{member.email}</p>
      </div>
      <select value={member.role} onChange={e => onChangeRole(e.target.value as UserRole)}
        className="hidden sm:block text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none text-gray-700 bg-white">
        {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
      </select>
      {allDepts.length > 0 && (
        <select value="" onChange={e => { if (e.target.value) onMoveToDept(e.target.value); }}
          className="hidden md:block text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none text-gray-600 bg-white">
          <option value="">Move to…</option>
          {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}
      <button onClick={onRemove} title="Remove from department"
        className="w-7 h-7 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100">
        <UserMinus size={13}/>
      </button>
    </div>
  );
}

function DeptManageModal({ dept, allUsers, allDepts, onClose }: {
  dept: DeptRecord; allUsers: ShipmateUser[]; allDepts: DeptRecord[]; onClose: () => void;
}) {
  const [deptName, setDeptName]     = useState(dept.name);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [addSearch, setAddSearch]   = useState('');
  useEffect(() => { setDeptName(dept.name); }, [dept.name]);
  const members    = allUsers.filter(u => u.department === dept.id);
  const nonMembers = allUsers.filter(u => u.department !== dept.id);
  const filteredNon = nonMembers.filter(u => {
    const q = addSearch.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
  async function saveName() {
    const t = deptName.trim();
    if (!t) { toast.error('Name cannot be empty'); return; }
    if (t === dept.name) { setEditingName(false); return; }
    setSavingName(true);
    try { await updateDoc(doc(db, 'departments', dept.id), { name: t }); toast.success('Renamed'); setEditingName(false); }
    catch { toast.error('Failed'); } finally { setSavingName(false); }
  }
  async function changeRole(user: ShipmateUser, role: UserRole) {
    try { await userService.updateUser(user.uid, { role }); toast.success(`${user.name}'s role updated`); }
    catch { toast.error('Failed'); }
  }
  async function moveToDept(user: ShipmateUser, newId: string) {
    try { await userService.updateUser(user.uid, { department: newId as any }); toast.success(`${user.name} moved`); }
    catch { toast.error('Failed'); }
  }
  async function removeFromDept(user: ShipmateUser) {
    try { await userService.updateUser(user.uid, { department: '' as any }); toast.success(`${user.name} removed`); }
    catch { toast.error('Failed'); }
  }
  async function addToDept(user: ShipmateUser) {
    try { await userService.updateUser(user.uid, { department: dept.id as any }); toast.success(`${user.name} added`); }
    catch { toast.error('Failed'); }
  }
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B5E] px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F5C518]/20 flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-[#F5C518]"/>
              </div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input autoFocus value={deptName} onChange={e => setDeptName(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter') saveName(); if (e.key==='Escape') {setDeptName(dept.name);setEditingName(false);} }}
                    className="bg-white/10 text-white border border-white/20 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none w-44"/>
                  <button onClick={saveName} disabled={savingName}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white">
                    <Check size={13}/>
                  </button>
                  <button onClick={() => {setDeptName(dept.name);setEditingName(false);}}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white/50 hover:text-white">
                    <X size={13}/>
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-white font-bold truncate">{dept.name}</h2>
                  <button onClick={() => setEditingName(true)} className="text-white/40 hover:text-white">
                    <Pencil size={12}/>
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-white/40 text-sm hidden sm:block">{members.length} member{members.length !== 1 ? 's' : ''}</span>
              <button onClick={onClose} className="text-white/50 hover:text-white"><X size={16}/></button>
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Current Members <span className="ml-2 text-gray-300 normal-case font-normal">{members.length}</span></p>
            {members.length === 0 ? (
              <div className="text-center py-8">
                <Users size={28} className="text-gray-200 mx-auto mb-2"/>
                <p className="text-sm text-gray-400">No members yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {members.map(m => (
                  <MemberRow key={m.uid} member={m} allDepts={allDepts.filter(d => d.id !== dept.id)}
                    onChangeRole={r => changeRole(m, r)} onMoveToDept={id => moveToDept(m, id)} onRemove={() => removeFromDept(m)}/>
                ))}
              </div>
            )}
          </div>
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Add Members <span className="ml-2 text-gray-300 normal-case font-normal">{nonMembers.length} available</span></p>
            {nonMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Everyone is already in this department</p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search…"
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"/>
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {filteredNon.map(u => {
                    const pal2 = avatarPalette(u.name);
                    return (
                      <div key={u.uid} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50">
                        <div className={`w-8 h-8 rounded-full ${pal2.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                          {u.photoURL
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                            : <span className={`text-[10px] font-bold ${pal2.text}`}>{initials(u.name)}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        <button onClick={() => addToDept(u)}
                          className="flex items-center gap-1.5 bg-[#1B2B5E] text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#2D4080]">
                          <Plus size={11}/>Add
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
          <button onClick={onClose} className="w-full py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Warehouse Manage Modal ───────────────────────────────────────────────────

function WarehouseManageModal({ warehouse, allUsers, onClose }: {
  warehouse: WarehouseRecord; allUsers: ShipmateUser[]; onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const members    = allUsers.filter(u => (u as any).warehouseId === warehouse.id);
  const nonMembers = allUsers.filter(u => (u as any).warehouseId !== warehouse.id);
  const filtered   = nonMembers.filter(u => {
    const q = search.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function assign(user: ShipmateUser) {
    try {
      await setDoc(doc(db, 'users', user.uid), { warehouseId: warehouse.id }, { merge: true });
      toast.success(`${user.name} assigned to ${warehouse.name}`);
    } catch { toast.error('Failed to assign'); }
  }
  async function unassign(user: ShipmateUser) {
    try {
      await setDoc(doc(db, 'users', user.uid), { warehouseId: '' }, { merge: true });
      toast.success(`${user.name} removed from ${warehouse.name}`);
    } catch { toast.error('Failed to remove'); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-[#1B2B5E] px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-2xl flex-shrink-0">
                {warehouse.flag}
              </div>
              <div>
                <p className="text-white font-black text-base">{warehouse.name} Warehouse</p>
                <p className="text-white/50 text-xs">{warehouse.address}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-sm">{members.length} staff</span>
              <button onClick={onClose} className="text-white/50 hover:text-white"><X size={16}/></button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">

          {/* Current staff */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Current Staff <span className="ml-2 text-gray-300 normal-case font-normal">{members.length}</span>
            </p>
            {members.length === 0 ? (
              <div className="text-center py-8">
                <Users size={28} className="text-gray-200 mx-auto mb-2"/>
                <p className="text-sm text-gray-400">No staff assigned yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {members.map(m => {
                  const pal = avatarPalette(m.name);
                  return (
                    <div key={m.uid} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 group">
                      <div className={`w-8 h-8 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                        {m.photoURL
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                          : <span className={`text-[10px] font-bold ${pal.text}`}>{initials(m.name)}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{m.name}</p>
                        <p className="text-xs text-gray-400 truncate">{(m as any).jobTitle ?? getRoleLabel(m.role)} · {m.department?.replace(/-/g,' ') ?? 'No dept'}</p>
                      </div>
                      <StatusBadge status={(m as any).status ?? 'active'}/>
                      <button onClick={() => unassign(m)}
                        className="w-7 h-7 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                        title="Remove from warehouse">
                        <UserMinus size={13}/>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assign staff */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Assign Staff <span className="ml-2 text-gray-300 normal-case font-normal">{nonMembers.length} available</span>
            </p>
            <div className="relative mb-3">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employees…"
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"/>
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">All employees already assigned</p>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto">
                {filtered.map(u => {
                  const pal = avatarPalette(u.name);
                  const currentWh = WAREHOUSE_SEED.find(w => w.id === (u as any).warehouseId);
                  return (
                    <div key={u.uid} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50">
                      <div className={`w-8 h-8 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                        {u.photoURL
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                          : <span className={`text-[10px] font-bold ${pal.text}`}>{initials(u.name)}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">
                          {(u as any).jobTitle ?? getRoleLabel(u.role)}
                          {currentWh && <span className="ml-1 text-amber-500">· currently {currentWh.flag} {currentWh.name}</span>}
                        </p>
                      </div>
                      <button onClick={() => assign(u)}
                        className="flex items-center gap-1.5 bg-[#1B2B5E] text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#2D4080] flex-shrink-0">
                        <Plus size={11}/>Assign
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
          <button onClick={onClose} className="w-full py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Account Modal ─────────────────────────────────────────────────────

function CreateAccountModal({
  departments,
  currentUser,
  onClose,
  onCreated,
}: {
  departments: DeptRecord[];
  currentUser: ShipmateUser;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName]           = useState('');
  const [emailUser, setEmailUser] = useState('');   // part before @
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [role, setRole]           = useState<UserRole>('employee');
  const [dept, setDept]           = useState(departments[0]?.id ?? '');
  const [saving, setSaving]       = useState(false);
  const [created, setCreated]     = useState<{ email: string; password: string } | null>(null);

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
    return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  useEffect(() => {
    setPassword(generatePassword());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fullEmail = emailUser.trim() ? `${emailUser.trim().toLowerCase()}@shipcube.com` : '';

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !emailUser.trim() || !password || !dept) {
      toast.error('All fields are required'); return;
    }
    setSaving(true);
    try {
      await createEmployeeAccount({
        name: name.trim(),
        email: fullEmail,
        password,
        department: dept as Department,
        role,
        createdBy: currentUser.uid,
        createdByName: currentUser.name,
      });
      setCreated({ email: fullEmail, password });
      onCreated();
      toast.success(`Account created for ${name.trim()}!`);
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to create account';
      if (msg.includes('email-already-in-use')) {
        toast.error('That email is already registered.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="bg-[#1B2B5E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={15} className="text-[#F5C518]" />
            <h2 className="text-white font-bold text-sm">Create Employee Account</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={18}/></button>
        </div>

        {/* Credentials panel — shown after successful creation */}
        {created ? (
          <div className="p-6 space-y-4">
            <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
              <Check size={26} className="text-green-500"/>
            </div>
            <p className="text-center font-bold text-gray-900">Account Created!</p>
            <p className="text-center text-sm text-gray-500">Share these credentials with the employee. They can change their password after signing in.</p>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Email</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono font-bold text-gray-800">{created.email}</p>
                  <button onClick={() => { navigator.clipboard.writeText(created.email); toast.success('Copied!'); }}
                    className="text-[10px] font-bold text-[#1B2B5E] bg-[#1B2B5E]/8 px-2 py-1 rounded-lg hover:bg-[#1B2B5E]/15 transition-colors flex-shrink-0">
                    Copy
                  </button>
                </div>
              </div>
              <div className="border-t border-gray-200 pt-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Temporary Password</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-mono font-bold text-gray-800">{created.password}</p>
                  <button onClick={() => { navigator.clipboard.writeText(created.password); toast.success('Copied!'); }}
                    className="text-[10px] font-bold text-[#1B2B5E] bg-[#1B2B5E]/8 px-2 py-1 rounded-lg hover:bg-[#1B2B5E]/15 transition-colors flex-shrink-0">
                    Copy
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-center">
              ⚠️ Save these credentials now — the password won&apos;t be shown again.
            </p>

            <button onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#1B2B5E] text-white font-bold text-sm hover:bg-[#2D4080] transition-colors">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="p-6 space-y-4">

            {/* Name */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                placeholder="John Smith"
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"/>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Email</label>
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#1B2B5E]/15 focus-within:border-[#1B2B5E] transition-all">
                <input type="text" value={emailUser} onChange={e => setEmailUser(e.target.value.replace(/[@\s]/g, ''))} required
                  placeholder="john.smith"
                  className="flex-1 px-3.5 py-2.5 text-sm bg-white focus:outline-none"/>
                <span className="px-3 py-2.5 bg-gray-50 border-l border-gray-200 text-sm text-gray-400 font-medium select-none">
                  @shipcube.com
                </span>
              </div>
            </div>

            {/* Role + Department */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Role</label>
                <select value={role} onChange={e => setRole(e.target.value as UserRole)} required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] bg-white">
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr_admin">HR Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">Department</label>
                <select value={dept} onChange={e => setDept(e.target.value)} required
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] bg-white">
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">
                Temporary Password
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input type={showPass ? 'text' : 'password'} value={password}
                    onChange={e => setPassword(e.target.value)} required minLength={8}
                    className="w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"/>
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
                <button type="button" onClick={() => setPassword(generatePassword())}
                  className="px-3 py-2.5 text-xs font-bold text-[#1B2B5E] bg-[#1B2B5E]/8 rounded-xl hover:bg-[#1B2B5E]/15 transition-colors whitespace-nowrap flex-shrink-0">
                  Regenerate
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Minimum 8 characters. Employee should change this after first login.</p>
            </div>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={saving || !name.trim() || !emailUser.trim() || !password || !dept}
                className="flex-1 py-3 rounded-xl bg-[#1B2B5E] text-white text-sm font-bold hover:bg-[#2D4080] disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={14} className="animate-spin"/>Creating…</> : <>Create Account</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const { currentUser } = useAuth();
  const [tab, setTab]               = useState<'employees' | 'departments' | 'warehouses' | 'tab-access'>('employees');
  const [users, setUsers]           = useState<ShipmateUser[]>([]);
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [loading, setLoading]       = useState(true);
  const [deptLoading, setDeptLoading] = useState(true);
  const [search, setSearch]         = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<ShipmateUser | null>(null);
  const [editingUser, setEditingUser]   = useState<ShipmateUser | null>(null);
  const [showAddDept, setShowAddDept]   = useState(false);
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [managingDept, setManagingDept] = useState<DeptRecord | null>(null);
  const [managingWarehouse, setManagingWarehouse] = useState<WarehouseRecord | null>(null);

  useEffect(() => {
    setLoading(true);
    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ShipmateUser)));
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });

    setDeptLoading(true);
    const unsubDepts = onSnapshot(collection(db, 'departments'), async snap => {
      const rawDocs = snap.docs.map(d => ({ _ref: d.ref, id: d.id, ...(d.data() as any) }));
      const SEED = [
        { id: 'ai-team', name: 'AI Team' }, { id: 'marketing', name: 'Marketing' },
        { id: 'finance', name: 'Finance' }, { id: 'hr', name: 'HR' },
      ];
      const existingIds = new Set(rawDocs.map((d: any) => d.id));
      const missing = SEED.filter(s => !existingIds.has(s.id));
      if (missing.length > 0) {
        await Promise.all(missing.map(s => setDoc(doc(db, 'departments', s.id), { name: s.name, slug: s.id, memberCount: 0, createdAt: serverTimestamp() }, { merge: true })));
      }
      const autoIdDocs = rawDocs.filter((d: any) => { const slug: string = d.slug ?? ''; return slug && d.id !== slug; });
      if (autoIdDocs.length > 0) {
        await Promise.all(autoIdDocs.map(async (d: any) => {
          const slug: string = d.slug;
          const slugRef = doc(db, 'departments', slug);
          const existing = await getDoc(slugRef);
          if (!existing.exists()) {
            await setDoc(slugRef, { name: d.name, slug, memberCount: d.memberCount ?? 0, createdAt: d.createdAt ?? serverTimestamp() });
          }
          await deleteDoc(d._ref);
        }));
        return;
      }
      const docs: DeptRecord[] = rawDocs.map(({ _ref, ...rest }: any) => rest as DeptRecord);
      docs.sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(docs);
      setDeptLoading(false);
    }, err => { console.error(err); setDeptLoading(false); });

    return () => { unsubUsers(); unsubDepts(); };
  }, []);

  // Counts by status
  const counts = useMemo(() => {
    const c: Record<string, number> = { active: 0, onboarding: 0, offboarding: 0, on_leave: 0, inactive: 0 };
    users.forEach(u => { const s = (u as any).status ?? 'active'; c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [users]);

  const filtered = useMemo(() => users.filter(u => {
    const q = search.toLowerCase();
    const matchS = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || u.department?.toLowerCase().includes(q);
    const matchD = deptFilter === 'all' || u.department === deptFilter;
    const matchSt = statusFilter === 'all' || ((u as any).status ?? 'active') === statusFilter;
    return matchS && matchD && matchSt;
  }), [users, search, deptFilter, statusFilter]);

  function usersInDept(deptId: string) {
    return users.filter(u => u.department === deptId || (u as any).slug === deptId);
  }

  function getDeptName(deptId: string) {
    return departments.find(d => d.id === deptId)?.name ?? deptId;
  }

  async function handleDeleteDept(dept: DeptRecord) {
    if (usersInDept(dept.id).length > 0) { toast.error('Remove all members first'); return; }
    if (!confirm(`Delete "${dept.name}"?`)) return;
    try { await deleteDoc(doc(db, 'departments', dept.id)); toast.success('Deleted'); }
    catch { toast.error('Failed to delete'); }
  }

  const deptsWithCounts = departments.map(d => ({ ...d, memberCount: usersInDept(d.id).length }));

  // Keep detail panel in sync when Firestore updates the user doc after an edit
  useEffect(() => {
    if (!selectedUser) return;
    const updated = users.find(u => u.uid === selectedUser.uid);
    if (updated && JSON.stringify(updated) !== JSON.stringify(selectedUser)) {
      setSelectedUser(updated);
    }
  }, [users]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedIdx = selectedUser ? filtered.findIndex(u => u.uid === selectedUser.uid) : -1;

  return (
    <div className="h-full flex overflow-hidden bg-gray-50">

      {/* ── Main column ── */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all ${selectedUser ? 'md:mr-0' : ''}`}>

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 md:py-5 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl md:text-2xl font-black text-gray-900">Employees</h1>
            <button
              onClick={() => setShowCreateAccount(true)}
              className="flex items-center gap-2 bg-[#1B2B5E] text-white text-sm font-bold px-3 md:px-4 py-2 md:py-2.5 rounded-xl hover:bg-[#2D4080] transition-colors"
            >
              <Plus size={14}/>
              <span className="hidden sm:inline">Create account</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
          <p className="text-sm text-gray-400">
            {counts.active ?? 0} active
            {(counts.onboarding ?? 0) > 0 && ` · ${counts.onboarding} onboarding`}
            {(counts.offboarding ?? 0) > 0 && ` · ${counts.offboarding} offboarding`}
          </p>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 flex-shrink-0">
          <div className="flex gap-4 md:gap-6">
            {([
              { id: 'employees',  label: 'Employees'  },
              { id: 'departments',label: 'Departments' },
              { id: 'warehouses', label: 'Warehouses'  },
              { id: 'tab-access', label: 'Tab Access'  },
            ] as const).map(({ id, label }) => (
              <button key={id} onClick={() => { setTab(id); setSelectedUser(null); }}
                className={`py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-all ${
                  tab === id ? 'border-[#1B2B5E] text-[#1B2B5E]' : 'border-transparent text-gray-400 hover:text-gray-600'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">

          {/* ── Employees tab ── */}
          {tab === 'employees' && (
            <>
              {/* Filters */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2.5 w-full sm:w-64">
                  <Search size={14} className="text-gray-400 flex-shrink-0"/>
                  <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search name, role, or ID…"
                    className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"/>
                  {search && <button onClick={() => setSearch('')}><X size={12} className="text-gray-400"/></button>}
                </div>

                <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-[#1B2B5E]">
                  <option value="all">All departments</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>

                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:border-[#1B2B5E]">
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="on_leave">On Leave</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="offboarding">Offboarding</option>
                  <option value="inactive">Inactive</option>
                </select>

                <span className="ml-auto text-xs text-gray-400">{filtered.length} employee{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-[#1B2B5E]"/>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-20">
                  <Users size={32} className="text-gray-200 mx-auto mb-3"/>
                  <p className="text-gray-400 font-medium">No employees found</p>
                  <p className="text-xs text-gray-300 mt-1">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className={`grid gap-3 ${selectedUser ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'}`}>
                  {filtered.map((user, i) => (
                    <EmployeeCard
                      key={user.uid} user={user} empIdx={i}
                      selected={selectedUser?.uid === user.uid}
                      onClick={() => setSelectedUser(prev => prev?.uid === user.uid ? null : user)}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Departments tab ── */}
          {tab === 'departments' && (
            <>
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm text-gray-500">{deptsWithCounts.length} department{deptsWithCounts.length !== 1 ? 's' : ''}</p>
                <button onClick={() => setShowAddDept(true)}
                  className="flex items-center gap-2 bg-[#1B2B5E] text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-[#2D4080] transition-colors">
                  <Plus size={14}/>New Department
                </button>
              </div>
              {deptLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={24} className="animate-spin text-[#1B2B5E]"/>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {deptsWithCounts.map((dept, i) => {
                    const grad = DEPT_GRADIENTS[i % DEPT_GRADIENTS.length];
                    const members = usersInDept(dept.id).slice(0, 3);
                    return (
                      <div key={dept.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-all">
                        <div className={`h-2 bg-gradient-to-r ${grad}`}/>
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <p className="font-bold text-gray-900">{dept.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{dept.memberCount ?? 0} member{(dept.memberCount ?? 0) !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setManagingDept(dept)} title="Manage"
                                className="w-7 h-7 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-[#1B2B5E] flex items-center justify-center transition-colors">
                                <Pencil size={13}/>
                              </button>
                              <button onClick={() => handleDeleteDept(dept)} title="Delete"
                                className="w-7 h-7 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors">
                                <Trash2 size={13}/>
                              </button>
                            </div>
                          </div>
                          <div className="flex -space-x-2 mb-3">
                            {members.map(m => {
                              const p2 = avatarPalette(m.name);
                              return (
                                <div key={m.uid} className={`w-7 h-7 rounded-full ${p2.bg} border-2 border-white flex items-center justify-center overflow-hidden`}>
                                  {m.photoURL
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                                    : <span className={`text-[9px] font-bold ${p2.text}`}>{initials(m.name)}</span>
                                  }
                                </div>
                              );
                            })}
                            {(dept.memberCount ?? 0) > 3 && (
                              <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                                <span className="text-[9px] font-bold text-gray-500">+{(dept.memberCount ?? 0) - 3}</span>
                              </div>
                            )}
                          </div>
                          <button onClick={() => setManagingDept(dept)}
                            className="w-full py-2 text-xs font-semibold text-[#1B2B5E] hover:bg-[#1B2B5E]/5 rounded-xl transition-colors">
                            Manage →
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── Warehouses tab ── */}
          {tab === 'warehouses' && (
            <>
              <div className="mb-5">
                <p className="text-sm text-gray-500">
                  {WAREHOUSE_SEED.length} warehouse locations · {users.filter(u => (u as any).warehouseId).length} staff assigned
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {WAREHOUSE_SEED.map(wh => {
                  const staff = users.filter(u => (u as any).warehouseId === wh.id);
                  const preview = staff.slice(0, 4);
                  const isUS = wh.country === 'US';
                  const gradMap: Record<string, string> = {
                    nj: 'from-blue-500 to-indigo-600',
                    pa: 'from-violet-500 to-purple-600',
                    ca: 'from-orange-400 to-amber-500',
                    tx: 'from-red-500 to-rose-600',
                    uae: 'from-emerald-500 to-teal-600',
                  };
                  const grad = gradMap[wh.id] ?? 'from-gray-400 to-gray-500';
                  return (
                    <div key={wh.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all group">

                      {/* Coloured banner */}
                      <div className={`bg-gradient-to-r ${grad} p-5 relative overflow-hidden`}>
                        <div className="absolute right-4 top-3 text-5xl opacity-20 select-none">{wh.flag}</div>
                        <div className="relative">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{wh.flag}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isUS ? 'bg-white/20 text-white' : 'bg-white/20 text-white'}`}>
                              {wh.code}
                            </span>
                          </div>
                          <p className="text-white font-black text-lg leading-tight">{wh.name}</p>
                          <p className="text-white/60 text-xs mt-0.5">{wh.address}</p>
                        </div>
                      </div>

                      {/* Stats + staff */}
                      <div className="p-5">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Staff</p>
                          <span className="text-xs font-black text-gray-700 bg-gray-100 rounded-full px-2 py-0.5">{staff.length}</span>
                        </div>

                        {/* Avatar stack */}
                        {staff.length === 0 ? (
                          <p className="text-xs text-gray-300 italic mb-3">No staff assigned yet</p>
                        ) : (
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex -space-x-2">
                              {preview.map(m => {
                                const pal = avatarPalette(m.name);
                                return (
                                  <div key={m.uid} title={m.name}
                                    className={`w-8 h-8 rounded-full ${pal.bg} border-2 border-white flex items-center justify-center overflow-hidden flex-shrink-0`}>
                                    {m.photoURL
                                      // eslint-disable-next-line @next/next/no-img-element
                                      ? <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                                      : <span className={`text-[9px] font-bold ${pal.text}`}>{initials(m.name)}</span>
                                    }
                                  </div>
                                );
                              })}
                              {staff.length > 4 && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center">
                                  <span className="text-[9px] font-bold text-gray-500">+{staff.length - 4}</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 truncate">
                                {staff.slice(0, 2).map(m => m.name.split(' ')[0]).join(', ')}
                                {staff.length > 2 ? ` +${staff.length - 2} more` : ''}
                              </p>
                            </div>
                          </div>
                        )}

                        <button onClick={() => setManagingWarehouse(wh)}
                          className="w-full py-2 text-xs font-bold text-[#1B2B5E] hover:bg-[#1B2B5E]/5 rounded-xl transition-colors border border-transparent hover:border-[#1B2B5E]/10">
                          Manage Staff →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unassigned employees */}
              {(() => {
                const unassigned = users.filter(u => !(u as any).warehouseId);
                if (unassigned.length === 0) return null;
                return (
                  <div className="mt-8">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      Unassigned <span className="ml-2 text-gray-300 normal-case font-normal">{unassigned.length} employee{unassigned.length !== 1 ? 's' : ''}</span>
                    </p>
                    <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-4">
                      <div className="flex flex-wrap gap-2">
                        {unassigned.map(u => {
                          const pal = avatarPalette(u.name);
                          return (
                            <div key={u.uid} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                              <div className={`w-6 h-6 rounded-full ${pal.bg} flex items-center justify-center overflow-hidden flex-shrink-0`}>
                                {u.photoURL
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"/>
                                  : <span className={`text-[8px] font-bold ${pal.text}`}>{initials(u.name)}</span>
                                }
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{u.name}</span>
                              <span className="text-[10px] text-gray-400">{u.department?.replace(/-/g,' ') ?? '—'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Tab Access tab ── */}
          {tab === 'tab-access' && (
            <TabAccessManager users={users} />
          )}

        </div>
      </div>

      {/* ── Detail Panel ── */}
      {selectedUser && (
        <div className="fixed inset-0 z-30 md:relative md:inset-auto md:z-auto w-full md:max-w-[420px] flex-shrink-0 h-full overflow-hidden border-l border-gray-100 bg-white">
          <EmployeeDetailPanel
            user={selectedUser}
            users={users}
            empIdx={selectedIdx >= 0 ? selectedIdx : 0}
            onClose={() => setSelectedUser(null)}
            onEdit={() => setEditingUser(selectedUser)}
            onDeleted={() => setSelectedUser(null)}
          />
        </div>
      )}

      {/* ── Modals ── */}
      {editingUser && (
        <EditModal
          user={editingUser}
          departments={departments}
          onClose={() => setEditingUser(null)}
          onSaved={() => {
            // Refresh selected user from updated list
            setSelectedUser(prev => prev ? ({ ...prev, ...(users.find(u => u.uid === prev.uid) ?? {}) }) : null);
          }}
        />
      )}
      {showCreateAccount && currentUser && (
        <CreateAccountModal
          departments={departments}
          currentUser={currentUser}
          onClose={() => setShowCreateAccount(false)}
          onCreated={() => { /* users list auto-updates via onSnapshot */ }}
        />
      )}
      {showAddDept && <AddDeptModal onClose={() => setShowAddDept(false)} onAdded={() => {}}/>}
      {managingDept && (
        <DeptManageModal
          dept={managingDept}
          allUsers={users}
          allDepts={departments.filter(d => d.id !== managingDept.id)}
          onClose={() => setManagingDept(null)}
        />
      )}
      {managingWarehouse && (
        <WarehouseManageModal
          warehouse={managingWarehouse}
          allUsers={users}
          onClose={() => setManagingWarehouse(null)}
        />
      )}
    </div>
  );
}
