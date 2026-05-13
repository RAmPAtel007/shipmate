'use client';

import { useEffect, useState, useRef } from 'react';
import {
  Users, Calendar, MessageSquare, FileText,
  TrendingUp, Clock, ChevronRight, Bell,
} from 'lucide-react';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRecord {
  uid: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  photoURL?: string;
  status: string;
}

interface RecentLeave {
  id: string;
  employeeName: string;
  employeePhotoURL?: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
  createdAt: any;
}

// ── Avatar initials helper ─────────────────────────────────────────────────────

function Initials({ name, photo, size = 32 }: { name: string; photo?: string; size?: number }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={photo} alt={name} className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />;
  }
  const colors = ['bg-[#1B2B5E]', 'bg-emerald-600', 'bg-violet-600', 'bg-rose-600', 'bg-amber-600', 'bg-cyan-600'];
  const idx = name.charCodeAt(0) % colors.length;
  return (
    <div
      className={`${colors[idx]} rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold`}
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

// ── Hover popover card ─────────────────────────────────────────────────────────

function HoverCard({
  children,
  popover,
  align = 'left',
}: {
  children: React.ReactNode;
  popover: React.ReactNode;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setOpen(true);
  }
  function hide() {
    timerRef.current = setTimeout(() => setOpen(false), 120);
  }

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {open && (
        <div
          className={`absolute top-full mt-2 z-50 w-72 bg-[#0D1832] border border-white/10 rounded-2xl shadow-2xl overflow-hidden ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onMouseEnter={show}
          onMouseLeave={hide}
          style={{ animation: 'fadeDown 0.15s ease-out' }}
        >
          {/* Arrow pointing up toward the card */}
          <div className={`absolute top-[-6px] w-3 h-3 bg-[#0D1832] border-t border-l border-white/10 rotate-45 ${
            align === 'right' ? 'right-6' : 'left-6'
          }`} />
          {popover}
        </div>
      )}
      <style jsx>{`
        @keyframes fadeDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ── Role badge ─────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  manager: 'Manager',
  employee: 'Employee',
};
const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-[#F5C518]/20 text-[#F5C518]',
  hr_admin:    'bg-violet-500/20 text-violet-300',
  manager:     'bg-emerald-500/20 text-emerald-300',
  employee:    'bg-white/10 text-white/50',
};

// ── Main dashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { currentUser } = useAuth();

  const [allUsers, setAllUsers]           = useState<UserRecord[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<RecentLeave[]>([]);
  const [recentLeaves, setRecentLeaves]   = useState<RecentLeave[]>([]);
  const [totalChannels, setTotalChannels] = useState(0);
  const [totalDocs, setTotalDocs]         = useState(0);
  const [totalAnnouncements, setTotalAnnouncements] = useState(0);
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [usersSnap, leavesSnap, channelsSnap, docsSnap, announcementsSnap, pendingSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc'), limit(6))),
          getDocs(collection(db, 'channels')),
          getDocs(collection(db, 'documents')),
          getDocs(collection(db, 'announcements')),
          getDocs(query(collection(db, 'leaveRequests'), where('status', '==', 'pending'))),
        ]);

        setAllUsers(usersSnap.docs.map(d => ({ uid: d.id, ...d.data() } as UserRecord)));
        setRecentLeaves(leavesSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecentLeave)));
        setPendingLeaves(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecentLeave)));
        setTotalChannels(channelsSnap.size);
        setTotalDocs(docsSnap.size);
        setTotalAnnouncements(announcementsSnap.size);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const activeUsers = allUsers.filter(u => u.status === 'active');

  // ── Popover panels ───────────────────────────────────────────────────────────

  function UserListPopover({ users, title }: { users: UserRecord[]; title: string }) {
    return (
      <div>
        <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
          <p className="text-xs font-bold text-white/60 uppercase tracking-widest">{title}</p>
          <span className="text-[10px] font-bold bg-white/10 text-white/50 px-2 py-0.5 rounded-full">{users.length}</span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
          {users.length === 0 ? (
            <p className="text-center text-white/30 text-xs py-6">No users</p>
          ) : (
            users.map(u => (
              <div key={u.uid} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                <Initials name={u.name} photo={u.photoURL} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                  <p className="text-[11px] text-white/35 truncate">{u.department ?? u.email}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${ROLE_COLORS[u.role] ?? 'bg-white/10 text-white/40'}`}>
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-white/8">
          <a href="/admin/users" className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#F5C518] hover:text-[#f0bc00] transition-colors">
            Manage all users <ChevronRight size={11} />
          </a>
        </div>
      </div>
    );
  }

  function PendingLeavesPopover() {
    return (
      <div>
        <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between">
          <p className="text-xs font-bold text-white/60 uppercase tracking-widest">Pending Leaves</p>
          <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded-full">{pendingLeaves.length}</span>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
          {pendingLeaves.length === 0 ? (
            <p className="text-center text-white/30 text-xs py-6">All caught up!</p>
          ) : (
            pendingLeaves.map(leave => (
              <div key={leave.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
                <Initials name={leave.employeeName} photo={leave.employeePhotoURL} size={30} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{leave.employeeName}</p>
                  <p className="text-[11px] text-white/35 capitalize">{leave.type?.replace(/-/g, ' ')} · {leave.startDate}</p>
                </div>
                <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded-md">Pending</span>
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2.5 border-t border-white/8">
          <a href="/admin/leaves" className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#F5C518] hover:text-[#f0bc00] transition-colors">
            Review leaves <ChevronRight size={11} />
          </a>
        </div>
      </div>
    );
  }

  function SimplePopover({ title, value, sub }: { title: string; value: number; sub: string }) {
    return (
      <div className="px-5 py-4 text-center">
        <p className="text-4xl font-black text-white">{value}</p>
        <p className="text-xs font-bold text-white/40 uppercase tracking-widest mt-1">{title}</p>
        <p className="text-[11px] text-white/30 mt-1">{sub}</p>
      </div>
    );
  }

  // ── Stat cards config ────────────────────────────────────────────────────────

  const statCards: {
    label: string;
    value: number;
    icon: React.ElementType;
    light: string;
    text: string;
    popover: React.ReactNode;
    align: 'left' | 'right';
  }[] = [
    {
      label: 'Total Users',
      value: allUsers.length,
      icon: Users,
      light: 'bg-blue-50',
      text: 'text-blue-600',
      align: 'left',
      popover: <UserListPopover users={allUsers} title="All Users" />,
    },
    {
      label: 'Active Users',
      value: activeUsers.length,
      icon: TrendingUp,
      light: 'bg-emerald-50',
      text: 'text-emerald-600',
      align: 'left',
      popover: <UserListPopover users={activeUsers} title="Active Users" />,
    },
    {
      label: 'Pending Leaves',
      value: pendingLeaves.length,
      icon: Clock,
      light: 'bg-amber-50',
      text: 'text-amber-600',
      align: 'left',
      popover: <PendingLeavesPopover />,
    },
    {
      label: 'Chat Channels',
      value: totalChannels,
      icon: MessageSquare,
      light: 'bg-purple-50',
      text: 'text-purple-600',
      align: 'right',
      popover: <SimplePopover title="Chat Channels" value={totalChannels} sub="Active team channels & DMs" />,
    },
    {
      label: 'Documents',
      value: totalDocs,
      icon: FileText,
      light: 'bg-rose-50',
      text: 'text-rose-600',
      align: 'right',
      popover: <SimplePopover title="Documents" value={totalDocs} sub="Files uploaded across all folders" />,
    },
    {
      label: 'Announcements',
      value: totalAnnouncements,
      icon: Bell,
      light: 'bg-indigo-50',
      text: 'text-indigo-600',
      align: 'right',
      popover: <SimplePopover title="Announcements" value={totalAnnouncements} sub="Company-wide broadcasts posted" />,
    },
  ];

  const statusColor: Record<string, string> = {
    pending:   'bg-amber-100 text-amber-700',
    approved:  'bg-emerald-100 text-emerald-700',
    rejected:  'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="h-full overflow-y-auto bg-gray-50/60">

      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1B2B5E] via-[#1e3270] to-[#0D1832]">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#F5C518]/10 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <p className="text-white/40 text-sm mb-1">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {greeting}, {currentUser?.name.split(' ')[0]} 👋
              </h1>
              <p className="text-white/35 text-sm mt-1">{"Here's a live overview of Shipcube."}</p>
            </div>
            <div className="flex items-center gap-2 bg-white/8 border border-white/10 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 w-fit">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
              <span className="text-white/50 text-xs font-semibold whitespace-nowrap">All systems operational</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">

        {/* ── Stats grid with hover popovers ──────────────────────────────── */}
        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 hidden sm:block">
            Overview — hover a card for details
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {statCards.map(({ label, value, icon: Icon, light, text, popover, align }) => (
              <HoverCard key={label} popover={popover} align={align}>
                <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-gray-100 cursor-default hover:border-gray-200 hover:shadow-md transition-all group h-full">
                  <div className={`w-9 h-9 sm:w-10 sm:h-10 ${light} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                    <Icon size={16} className={text} />
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-gray-900">
                    {loading ? <span className="inline-block w-8 h-6 rounded shimmer" /> : value}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 font-medium leading-tight">{label}</p>
                  <p className="text-[10px] text-gray-300 mt-1.5 group-hover:text-[#1B2B5E]/60 transition-colors hidden sm:block">
                    hover to explore →
                  </p>
                </div>
              </HoverCard>
            ))}
          </div>
        </div>

        {/* ── Recent Leaves ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900 text-sm sm:text-base">Recent Leave Requests</h2>
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">Latest submissions from the team</p>
            </div>
            <a
              href="/admin/leaves"
              className="flex items-center gap-1 text-xs sm:text-sm text-[#1B2B5E] font-bold hover:text-[#243872] transition-colors whitespace-nowrap"
            >
              View all <ChevronRight size={13} />
            </a>
          </div>
          <div className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full shimmer flex-shrink-0" />
                  <div className="flex-1 space-y-1.5 min-w-0">
                    <div className="h-3.5 w-32 rounded shimmer" />
                    <div className="h-3 w-24 rounded shimmer" />
                  </div>
                  <div className="w-16 sm:w-20 h-6 rounded-full shimmer flex-shrink-0" />
                </div>
              ))
            ) : recentLeaves.length === 0 ? (
              <p className="px-6 py-8 text-gray-400 text-sm text-center">No leave requests yet</p>
            ) : (
              recentLeaves.map(leave => (
                <div key={leave.id} className="px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 sm:gap-4 hover:bg-gray-50/80 transition-colors">
                  <Initials name={leave.employeeName} photo={leave.employeePhotoURL} size={34} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{leave.employeeName}</p>
                    <p className="text-xs text-gray-400 capitalize truncate">
                      {leave.type?.replace(/-/g, ' ')} · {leave.startDate}
                      {leave.endDate && leave.endDate !== leave.startDate ? ` → ${leave.endDate}` : ''}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusColor[leave.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {leave.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
