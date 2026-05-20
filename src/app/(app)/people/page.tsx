'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, X, Mail, Phone, MessageSquare, Users, MapPin } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, Badge, RoleBadge, EmptyState } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { formatDate, formatBirthdayDisplay } from '@/lib/utils/formatters';
import { useDepartments } from '@/hooks/useDepartments';
import { chatService } from '@/lib/services/chatService';
import type { ShipmateUser } from '@/lib/types';

const DEPT_COLORS: Record<string, string> = {
  'ai-team':   'bg-purple-100 text-purple-700',
  'marketing': 'bg-orange-100 text-orange-700',
  'finance':   'bg-emerald-100 text-emerald-700',
  'hr':        'bg-pink-100 text-pink-700',
};

const WAREHOUSE_MAP: Record<string, { flag: string; name: string }> = {
  nj:  { flag: '🇺🇸', name: 'New Jersey'   },
  pa:  { flag: '🇺🇸', name: 'Pennsylvania'  },
  ca:  { flag: '🇺🇸', name: 'California'    },
  tx:  { flag: '🇺🇸', name: 'Texas'         },
  uae: { flag: '🇦🇪', name: 'Dubai, UAE'    },
};

// ── User Profile Modal ──────────────────────────────────────────────────────

function UserProfileModal({
  user,
  onClose,
  onDM,
  dmLoading,
}: {
  user: ShipmateUser;
  onClose: () => void;
  onDM: () => void;
  dmLoading: boolean;
}) {
  const { currentUser } = useAuth();
  const { isHRorAdmin } = useRole();
  const { getDeptName } = useDepartments();
  const isSelf = currentUser?.uid === user.uid;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-2xl shadow-modal overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
          <div className="flex items-center gap-4 pr-8">
            <div className="relative flex-shrink-0">
              <Avatar name={user.name} src={user.photoURL} size="xl" className="ring-4 ring-[#1B2B5E]/10" />
              {user.status === 'active' && (
                <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-white" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-gray-900 font-bold text-lg leading-tight truncate">{user.name}</h2>
              <p className="text-gray-500 text-sm mt-0.5 truncate">{user.email}</p>
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <RoleBadge role={user.role} />
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${DEPT_COLORS[user.department] ?? 'bg-gray-100 text-gray-600'}`}>
                  {getDeptName(user.department)}
                </span>
                {user.status === 'inactive' && <Badge variant="error">Inactive</Badge>}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div className="p-5 space-y-3">
          <a
            href={`mailto:${user.email}`}
            className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
              <Mail size={16} className="text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-gray-400 font-medium">Email</p>
              <p className="text-sm text-gray-800 font-medium">{user.email}</p>
            </div>
          </a>

          {user.phone && (
            <a
              href={`tel:${user.phone}`}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <Phone size={16} className="text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Phone</p>
                <p className="text-sm text-gray-800 font-medium">{user.phone}</p>
              </div>
            </a>
          )}

          {user.birthday && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <div className="w-10 h-10 bg-pink-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🎂</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Birthday</p>
                <p className="text-sm text-gray-800 font-medium">
                  {formatBirthdayDisplay(user.birthday)}
                  {(isHRorAdmin || isSelf) && (
                    <span className="text-gray-400 text-xs ml-1">({user.birthday})</span>
                  )}
                </p>
              </div>
            </div>
          )}

          {user.joiningDate && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <span className="text-lg">📅</span>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Joined</p>
                <p className="text-sm text-gray-800 font-medium">{formatDate(user.joiningDate)}</p>
              </div>
            </div>
          )}

          {(user as any).warehouseId && WAREHOUSE_MAP[(user as any).warehouseId] && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
              <div className="w-10 h-10 bg-sky-50 rounded-xl flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-sky-500" />
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium">Warehouse</p>
                <p className="text-sm text-gray-800 font-medium">
                  {WAREHOUSE_MAP[(user as any).warehouseId].flag}{' '}
                  {WAREHOUSE_MAP[(user as any).warehouseId].name}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        {!isSelf && (
          <div className="px-5 pb-6">
            <button
              onClick={onDM}
              disabled={dmLoading}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1B2B5E] text-white py-3.5 rounded-2xl text-sm font-semibold hover:bg-[#2D4080] transition-colors disabled:opacity-60 shadow-sm"
            >
              {dmLoading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <MessageSquare size={17} />
              )}
              {dmLoading ? 'Opening chat…' : 'Send Message'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── User Card ────────────────────────────────────────────────────────────────

function UserCard({
  user,
  onClick,
  onDM,
  isSelf,
  dmLoading,
}: {
  user: ShipmateUser;
  onClick: () => void;
  onDM: (e: React.MouseEvent) => void;
  isSelf: boolean;
  dmLoading: boolean;
}) {
  const { getDeptName } = useDepartments();
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 overflow-hidden group">
      <button onClick={onClick} className="w-full p-5 text-left">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="relative">
            <Avatar name={user.name} src={user.photoURL} size="lg" className="ring-2 ring-gray-100" />
            {user.status === 'inactive' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-gray-400 rounded-full border-2 border-white" />
            )}
            {user.status === 'active' && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
            )}
          </div>
          <div className="min-w-0 w-full">
            <p className="font-bold text-gray-900 text-base truncate">{user.name}</p>
            <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1 ${DEPT_COLORS[user.department] ?? 'bg-gray-100 text-gray-600'}`}>
              {getDeptName(user.department)}
            </span>
            {(user as any).warehouseId && WAREHOUSE_MAP[(user as any).warehouseId] && (
              <p className="text-[11px] text-gray-400 mt-1">
                {WAREHOUSE_MAP[(user as any).warehouseId].flag} {WAREHOUSE_MAP[(user as any).warehouseId].name}
              </p>
            )}
          </div>
          <RoleBadge role={user.role} />
        </div>
      </button>

      {/* Message button — visible on hover */}
      {!isSelf && (
        <div className="px-4 pb-4">
          <button
            onClick={onDM}
            disabled={dmLoading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1B2B5E]/5 hover:bg-[#1B2B5E] text-[#1B2B5E] hover:text-white text-sm font-semibold transition-all duration-150 disabled:opacity-50"
          >
            {dmLoading ? (
              <div className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />
            ) : (
              <MessageSquare size={15} />
            )}
            Message
          </button>
        </div>
      )}
    </div>
  );
}

// ── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full shimmer" />
        <div className="w-28 h-4 rounded shimmer" />
        <div className="w-20 h-3.5 rounded shimmer" />
        <div className="w-16 h-5 rounded-full shimmer" />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const { departments, getDeptName } = useDepartments();

  const [users, setUsers] = useState<ShipmateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<ShipmateUser | null>(null);
  const [dmLoading, setDmLoading] = useState<string | null>(null);

  useEffect(() => {
    const unsub = userService.subscribeToUsers(users => {
      setUsers(users);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()) ||
        u.email.replace('@shipcube.com', '').toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'all' || u.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [users, search, deptFilter]);

  const deptCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of users) {
      counts[u.department] = (counts[u.department] ?? 0) + 1;
    }
    return counts;
  }, [users]);

  async function startDM(targetUser: ShipmateUser, e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!currentUser || dmLoading) return;
    setDmLoading(targetUser.uid);
    try {
      const channelId = await chatService.getOrCreateDM(
        currentUser.uid, currentUser.name,
        targetUser.uid, targetUser.name,
      );
      setSelectedUser(null);
      router.push(`/chat?dm=${channelId}`);
    } finally {
      setDmLoading(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-5 md:p-8 max-w-6xl mx-auto pb-8">

      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">People</h1>
          <p className="text-gray-500 mt-1 text-sm truncate">
            {loading ? 'Loading…' : `${users.length} team member${users.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm flex-shrink-0">
          <div className="w-2 h-2 bg-emerald-400 rounded-full" />
          @shipcube.com only
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-base focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] shadow-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Department filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 no-scrollbar">
        {[{ id: 'all', name: 'All' }, ...departments].map(d => {
          const count = deptCounts[d.id] ?? 0;
          const isActive = deptFilter === d.id;
          return (
            <button
              key={d.id}
              onClick={() => setDeptFilter(d.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-all ${
                isActive
                  ? 'bg-[#1B2B5E] text-white shadow-sm'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-[#1B2B5E]/40'
              }`}
            >
              {d.name}
              {!loading && (d.id === 'all' ? users.length : count) > 0 && (
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full leading-none ${
                  isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  {d.id === 'all' ? users.length : count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-gray-400" />
          </div>
          <p className="text-lg font-semibold text-gray-700">
            {search ? `No results for "${search}"` : 'No team members found'}
          </p>
          <p className="text-gray-400 text-sm mt-1">
            {search
              ? 'Try searching by name or email (e.g. john or john@shipcube.com)'
              : 'Team members appear here after they sign in with their @shipcube.com account.'}
          </p>
          {(search || deptFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setDeptFilter('all'); }}
              className="mt-4 px-5 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map(user => (
            <UserCard
              key={user.uid}
              user={user}
              isSelf={currentUser?.uid === user.uid}
              onClick={() => setSelectedUser(user)}
              onDM={(e) => startDM(user, e)}
              dmLoading={dmLoading === user.uid}
            />
          ))}
        </div>
      )}

      {/* Profile modal */}
      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDM={() => startDM(selectedUser)}
          dmLoading={dmLoading === selectedUser.uid}
        />
      )}
    </div>
  );
}
