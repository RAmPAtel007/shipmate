'use client';

import { useState, useEffect, useMemo } from 'react';
import { Search, X, Mail, Phone, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, Badge, RoleBadge, EmptyState } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { getDepartmentLabel, formatDate, formatBirthdayDisplay } from '@/lib/utils/formatters';
import { chatService } from '@/lib/services/chatService';
import type { ShipmateUser, Department } from '@/lib/types';

const DEPARTMENTS: { label: string; value: Department | 'all' }[] = [
  { label: 'All',       value: 'all' },
  { label: 'AI Team',   value: 'ai-team' },
  { label: 'Marketing', value: 'marketing' },
  { label: 'Finance',   value: 'finance' },
  { label: 'HR',        value: 'hr' },
];

// ── User Profile Modal ──────────────────────────────────────────────────────

function UserProfileModal({
  user,
  onClose,
  onDM,
}: {
  user: ShipmateUser;
  onClose: () => void;
  onDM: () => void;
}) {
  const { currentUser } = useAuth();
  const { isHRorAdmin } = useRole();
  const isSelf = currentUser?.uid === user.uid;

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1B2B5E] p-6 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/60 hover:text-white w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10"
          >
            <X size={16} />
          </button>
          <Avatar name={user.name} src={user.photoURL} size="xl" className="mx-auto mb-3" />
          <h2 className="text-white font-bold text-lg">{user.name}</h2>
          <div className="flex items-center justify-center gap-2 mt-1.5 flex-wrap">
            <RoleBadge role={user.role} />
            <Badge variant="neutral">{getDepartmentLabel(user.department)}</Badge>
            {user.status === 'inactive' && <Badge variant="error">Inactive</Badge>}
          </div>
        </div>

        {/* Details */}
        <div className="p-5 space-y-3">
          <a
            href={`mailto:${user.email}`}
            className="flex items-center gap-3 text-sm text-gray-700 hover:text-[#1B2B5E]"
          >
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
              <Mail size={14} className="text-blue-500" />
            </div>
            {user.email}
          </a>

          {user.phone && (
            <a
              href={`tel:${user.phone}`}
              className="flex items-center gap-3 text-sm text-gray-700 hover:text-[#1B2B5E]"
            >
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Phone size={14} className="text-emerald-500" />
              </div>
              {user.phone}
            </a>
          )}

          {user.birthday && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 bg-pink-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-pink-500 text-sm">🎂</span>
              </div>
              {formatBirthdayDisplay(user.birthday)}
              {(isHRorAdmin || isSelf) && (
                <span className="text-gray-400 text-xs">({user.birthday})</span>
              )}
            </div>
          )}

          {user.joiningDate && (
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-purple-500 text-xs font-bold">📅</span>
              </div>
              Joined {formatDate(user.joiningDate)}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isSelf && (
          <div className="px-5 pb-5">
            <button
              onClick={onDM}
              className="w-full flex items-center justify-center gap-2 bg-[#1B2B5E] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors"
            >
              <MessageSquare size={15} />
              Send Message
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── User Card ────────────────────────────────────────────────────────────────

function UserCard({ user, onClick }: { user: ShipmateUser; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-card p-4 text-left hover:shadow-elevated hover:-translate-y-0.5 transition-all duration-150 w-full"
    >
      <div className="flex flex-col items-center text-center gap-2">
        <div className="relative">
          <Avatar name={user.name} src={user.photoURL} size="lg" />
          {user.status === 'inactive' && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-400 rounded-full border-2 border-white" />
          )}
        </div>
        <div className="min-w-0 w-full">
          <p className="font-semibold text-gray-900 text-sm truncate">{user.name}</p>
          <p className="text-xs text-gray-500 truncate">{getDepartmentLabel(user.department)}</p>
        </div>
        <RoleBadge role={user.role} />
      </div>
    </button>
  );
}

// ── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-full shimmer" />
        <div className="w-24 h-3 rounded shimmer" />
        <div className="w-16 h-2.5 rounded shimmer" />
        <div className="w-14 h-4 rounded-full shimmer" />
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PeoplePage() {
  const { currentUser } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<ShipmateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState<Department | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<ShipmateUser | null>(null);

  useEffect(() => {
    userService.getAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch = !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchDept = deptFilter === 'all' || u.department === deptFilter;
      return matchSearch && matchDept;
    });
  }, [users, search, deptFilter]);

  async function handleDM() {
    if (!selectedUser || !currentUser) return;
    const channelId = await chatService.getOrCreateDM(currentUser.uid, selectedUser.uid);
    setSelectedUser(null);
    router.push(`/chat?dm=${channelId}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto pb-6">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">People</h1>
        <p className="text-sm text-gray-500 mt-0.5">{users.length} team members</p>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Department filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
        {DEPARTMENTS.map(d => (
          <button
            key={d.value}
            onClick={() => setDeptFilter(d.value)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              deptFilter === d.value
                ? 'bg-[#1B2B5E] text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-[#1B2B5E]/30'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Search size={24} />}
          title="No results"
          description="Try a different name or department filter."
          action={search || deptFilter !== 'all' ? { label: 'Clear filters', onClick: () => { setSearch(''); setDeptFilter('all'); } } : undefined}
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(user => (
            <UserCard key={user.uid} user={user} onClick={() => setSelectedUser(user)} />
          ))}
        </div>
      )}

      {/* Profile modal */}
      {selectedUser && (
        <UserProfileModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onDM={handleDM}
        />
      )}
    </div>
  );
}
