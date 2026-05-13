'use client';

import { useState, useEffect, useRef } from 'react';
import {
  User, Bell, Shield, Users, ChevronRight,
  Camera, Save, Loader2, Eye, EyeOff,
  CheckCircle2, AlertCircle, Plus, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, Badge, RoleBadge, Button } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { storageService } from '@/lib/services/storageService';
import { getDepartmentLabel, getRoleLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import type { ShipmateUser, Department, UserRole } from '@/lib/types';
import toast from 'react-hot-toast';

// ── Section nav ───────────────────────────────────────────────────────────────

type Section = 'profile' | 'notifications' | 'team';

const NAV: { id: Section; label: string; icon: typeof User; adminOnly?: boolean }[] = [
  { id: 'profile',       label: 'My Profile',      icon: User  },
  { id: 'notifications', label: 'Notifications',    icon: Bell  },
  { id: 'team',          label: 'Team Management',  icon: Users, adminOnly: true },
];

// ── Profile section ───────────────────────────────────────────────────────────

function ProfileSection() {
  const { currentUser, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName]       = useState(currentUser?.name ?? '');
  const [phone, setPhone]     = useState(currentUser?.phone ?? '');
  const [birthday, setBirthday] = useState(currentUser?.birthday ?? '');
  const [saving, setSaving]   = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  if (!currentUser) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await userService.updateUser(currentUser!.uid, { name, phone, birthday });
      await refreshUser();
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    try {
      const url = await storageService.uploadAvatar(currentUser!.uid, file);
      await userService.updateUser(currentUser!.uid, { photoURL: url });
      await refreshUser();
      toast.success('Photo updated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to upload photo');
    } finally {
      setAvatarLoading(false);
    }
  }

  const hasChanges =
    name !== currentUser.name ||
    phone !== (currentUser.phone ?? '') ||
    birthday !== (currentUser.birthday ?? '');

  return (
    <div className="space-y-6">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={currentUser.name} src={currentUser.photoURL} size="xl" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarLoading}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#1B2B5E] text-white rounded-full flex items-center justify-center hover:bg-[#2D4080] shadow-sm"
          >
            {avatarLoading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
        <div>
          <p className="font-semibold text-gray-900">{currentUser.name}</p>
          <p className="text-sm text-gray-500">{currentUser.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <RoleBadge role={currentUser.role} />
            <Badge variant="neutral">{getDepartmentLabel(currentUser.department)}</Badge>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-4 bg-white rounded-2xl p-4 border border-gray-100">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+91 00000 00000"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Birthday (optional)</label>
          <input
            type="date"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          <p className="text-xs text-gray-400 mt-1">Used for birthday reminders on the Home page.</p>
        </div>

        {/* Read-only info */}
        <div className="pt-2 border-t border-gray-100 space-y-3">
          {[
            { label: 'Email', value: currentUser.email },
            { label: 'Department', value: getDepartmentLabel(currentUser.department) },
            { label: 'Role', value: getRoleLabel(currentUser.role) },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-500">{item.label}</span>
              <span className="text-sm text-gray-700">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <Button
        variant="primary"
        onClick={handleSave}
        disabled={!hasChanges || saving}
        loading={saving}
        className="w-full"
      >
        Save Changes
      </Button>
    </div>
  );
}

// ── Notification section ──────────────────────────────────────────────────────

function NotificationsSection() {
  const [pushEnabled, setPushEnabled] = useState(
    typeof window !== 'undefined' && Notification.permission === 'granted'
  );
  const [requesting, setRequesting] = useState(false);

  async function enablePush() {
    setRequesting(true);
    try {
      const perm = await Notification.requestPermission();
      setPushEnabled(perm === 'granted');
      if (perm === 'granted') toast.success('Push notifications enabled');
      else toast.error('Permission denied — enable in browser settings');
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">Push Notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Receive alerts for messages, leave updates, and birthdays.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {pushEnabled ? (
              <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                <CheckCircle2 size={14} /> Enabled
              </span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={enablePush}
                loading={requesting}
              >
                Enable
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Notifications work best when Shipmate is added to your home screen as a PWA.
          On iOS, open in Safari → Share → Add to Home Screen.
        </p>
      </div>
    </div>
  );
}

// ── Team management section ───────────────────────────────────────────────────

const DEPARTMENTS: Department[] = ['ai-team', 'marketing', 'finance', 'hr'];
const ROLES: UserRole[] = ['super_admin', 'hr_admin', 'manager', 'employee'];

function TeamSection() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<ShipmateUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<ShipmateUser | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state for editing
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [editDept, setEditDept] = useState<Department>('ai-team');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');

  async function loadUsers() {
    setLoading(true);
    try {
      const all = await userService.getAllUsers();
      setUsers(all);
    } finally {
      setLoading(false);
    }
  }

  // Load on mount
  useEffect(() => { loadUsers(); }, []);

  function openEdit(user: ShipmateUser) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditDept(user.department);
    setEditStatus(user.status ?? 'active');
  }

  async function saveEdit() {
    if (!editingUser) return;
    setSaving(true);
    try {
      await userService.updateUser(editingUser.uid, {
        role: editRole,
        department: editDept,
        status: editStatus,
      });
      toast.success('User updated');
      setEditingUser(null);
      await loadUsers();
    } catch {
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 p-3">
            <div className="w-9 h-9 rounded-full shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-32 rounded shimmer" />
              <div className="h-2.5 w-20 rounded shimmer" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{users.length} team members</p>

      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {users.map(user => (
          <div key={user.uid} className="flex items-center gap-3 p-3">
            <Avatar name={user.name} src={user.photoURL} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 truncate">{user.name}</p>
              <p className="text-xs text-gray-400">{getDepartmentLabel(user.department)}</p>
            </div>
            <RoleBadge role={user.role} />
            {user.status === 'inactive' && <Badge variant="error">Inactive</Badge>}
            {user.uid !== currentUser?.uid && (
              <button
                onClick={() => openEdit(user)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#1B2B5E]"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Edit modal */}
      {editingUser && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
          onClick={() => setEditingUser(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl p-5 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <Avatar name={editingUser.name} src={editingUser.photoURL} size="md" />
              <div>
                <p className="font-semibold text-gray-900">{editingUser.name}</p>
                <p className="text-xs text-gray-400">{editingUser.email}</p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{getRoleLabel(r)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Department</label>
                <select
                  value={editDept}
                  onChange={e => setEditDept(e.target.value as Department)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15"
                >
                  {DEPARTMENTS.map(d => (
                    <option key={d} value={d}>{getDepartmentLabel(d)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="ghost" className="flex-1" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" onClick={saveEdit} loading={saving}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { isAdmin } = useRole();
  const [section, setSection] = useState<Section>('profile');

  const visibleNav = NAV.filter(n => !n.adminOnly || isAdmin);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {visibleNav.map(n => {
          const Icon = n.icon;
          return (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all',
                section === n.id
                  ? 'bg-white text-[#1B2B5E] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{n.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {section === 'profile'       && <ProfileSection />}
      {section === 'notifications' && <NotificationsSection />}
      {section === 'team'          && isAdmin && <TeamSection />}
    </div>
  );
}
