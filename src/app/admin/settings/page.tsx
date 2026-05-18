'use client';

import { useState, useEffect, useRef } from 'react';
import {
  User, Bell, Users, Camera, Loader2,
  CheckCircle2, AlertCircle, Pencil, Settings,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, Badge, RoleBadge, Button } from '@/components/ui';
import { userService } from '@/lib/services/userService';
import { storageService } from '@/lib/services/storageService';
import { getDepartmentLabel, getRoleLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import type { ShipmateUser, UserRole } from '@/lib/types';
import toast from 'react-hot-toast';

type Section = 'profile' | 'team' | 'notifications';

// ── Dynamic department record (loaded from Firestore) ─────────────────────────
interface DeptRecord { id: string; name: string; }

const ROLES: UserRole[] = ['super_admin', 'hr_admin', 'manager', 'employee'];

// ── Profile ───────────────────────────────────────────────────────────────────

function ProfileSection() {
  const { currentUser, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName]         = useState(currentUser?.name ?? '');
  const [phone, setPhone]       = useState(currentUser?.phone ?? '');
  const [birthday, setBirthday] = useState(currentUser?.birthday ?? '');
  const [saving, setSaving]     = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  if (!currentUser) return null;

  const hasChanges =
    name !== currentUser.name ||
    phone !== (currentUser.phone ?? '') ||
    birthday !== (currentUser.birthday ?? '');

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

  return (
    <div className="space-y-6">
      {/* Avatar row */}
      <div className="flex items-center gap-4 p-5 bg-white rounded-2xl border border-gray-200">
        <div className="relative">
          <Avatar name={currentUser.name} src={currentUser.photoURL} size="xl" />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={avatarLoading}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#F5C518] text-gray-900 rounded-full flex items-center justify-center hover:bg-[#D4A016] shadow-sm transition-colors"
          >
            {avatarLoading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-base">{currentUser.name}</p>
          <p className="text-sm text-gray-500">{currentUser.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <RoleBadge role={currentUser.role} />
            <Badge variant="neutral">{getDepartmentLabel(currentUser.department)}</Badge>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-bold text-gray-700">Edit Profile</h3>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Display Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone (optional)</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+91 00000 00000"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Birthday (optional)</label>
          <input
            type="date"
            value={birthday}
            onChange={e => setBirthday(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
          />
        </div>

        {/* Read-only */}
        <div className="pt-3 border-t border-gray-100 space-y-2.5">
          {[
            { label: 'Email', value: currentUser.email },
            { label: 'Department', value: getDepartmentLabel(currentUser.department) },
            { label: 'Role', value: getRoleLabel(currentUser.role) },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{item.label}</span>
              <span className="text-sm text-gray-700 font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={!hasChanges || saving}
        className={cn(
          'w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all',
          hasChanges && !saving
            ? 'bg-[#F5C518] text-gray-900 hover:bg-[#D4A016]'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        )}
      >
        {saving && <Loader2 size={14} className="animate-spin" />}
        Save Changes
      </button>
    </div>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────

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
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-800">Push Notifications</p>
            <p className="text-xs text-gray-400 mt-0.5">Receive alerts for messages, leave updates, and more.</p>
          </div>
          {pushEnabled ? (
            <span className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
              <CheckCircle2 size={14} /> Enabled
            </span>
          ) : (
            <button
              onClick={enablePush}
              disabled={requesting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5C518] text-gray-900 text-xs font-semibold rounded-lg hover:bg-[#D4A016] transition-colors disabled:opacity-50"
            >
              {requesting && <Loader2 size={12} className="animate-spin" />}
              Enable
            </button>
          )}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
        <AlertCircle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Notifications work best when Shipcube HR & Administration is added to your home screen as a PWA.
          On iOS, open in Safari → Share → Add to Home Screen.
        </p>
      </div>
    </div>
  );
}

// ── Team Management ───────────────────────────────────────────────────────────

function TeamSection() {
  const { currentUser } = useAuth();

  const [users, setUsers]           = useState<ShipmateUser[]>([]);
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [loading, setLoading]       = useState(true);

  const [editingUser, setEditingUser] = useState<ShipmateUser | null>(null);
  const [saving, setSaving]         = useState(false);
  const [editRole,   setEditRole]   = useState<UserRole>('employee');
  const [editDept,   setEditDept]   = useState<string>('');
  const [editStatus, setEditStatus] = useState<'active' | 'inactive'>('active');

  // ── Real-time listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);

    // Live users
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      snap => {
        setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ShipmateUser)));
        setLoading(false);
      },
      err => { console.error('[settings/users]', err); setLoading(false); }
    );

    // Live departments — auto-updates whenever a dept is added/deleted
    const unsubDepts = onSnapshot(
      collection(db, 'departments'),
      snap => {
        const docs = snap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
        docs.sort((a, b) => a.name.localeCompare(b.name));
        setDepartments(docs);
      },
      err => console.error('[settings/depts]', err)
    );

    return () => { unsubUsers(); unsubDepts(); };
  }, []);

  // Resolve department display name — tries live list first, falls back to formatter
  function getDeptName(deptId: string) {
    return departments.find(d => d.id === deptId)?.name
      ?? getDepartmentLabel(deptId as any);
  }

  function openEdit(user: ShipmateUser) {
    setEditingUser(user);
    setEditRole(user.role);
    setEditDept(user.department ?? '');
    setEditStatus(user.status ?? 'active');
  }

  async function saveEdit() {
    if (!editingUser) return;
    setSaving(true);
    try {
      await userService.updateUser(editingUser.uid, {
        role: editRole,
        department: editDept as any,
        status: editStatus,
      });
      toast.success('User updated');
      setEditingUser(null);
      // No manual reload — onSnapshot handles it
    } catch {
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="w-9 h-9 rounded-full bg-gray-100 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 font-medium">{users.length} team members</p>
        <p className="text-xs text-gray-400 font-medium">
          {departments.length} department{departments.length !== 1 ? 's' : ''}
          {departments.length > 0 && (
            <span className="ml-1 text-[#1B2B5E]/60">
              · {departments.map(d => d.name).join(', ')}
            </span>
          )}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
        {users.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-8">No team members found</p>
        ) : (
          users.map(user => (
            <div key={user.uid} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={user.name} src={user.photoURL} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 truncate">{getDeptName(user.department)}</p>
              </div>
              <RoleBadge role={user.role} />
              {user.status === 'inactive' && <Badge variant="error">Inactive</Badge>}
              {user.uid !== currentUser?.uid && (
                <button
                  onClick={() => openEdit(user)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                  title="Edit user"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Edit modal */}
      {editingUser && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingUser(null)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={editingUser.name} src={editingUser.photoURL} size="sm" />
                <div>
                  <p className="font-bold text-white text-sm">{editingUser.name}</p>
                  <p className="text-[11px] text-white/50">{editingUser.email}</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Role</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
                >
                  {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
                  Department
                  {departments.length === 0 && (
                    <span className="ml-1.5 text-amber-500 normal-case font-normal">
                      — no departments yet, add from Team Management
                    </span>
                  )}
                </label>
                <select
                  value={editDept}
                  onChange={e => setEditDept(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
                >
                  <option value="">— Unassigned —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as 'active' | 'inactive')}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#F5C518]/30 focus:border-[#F5C518]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingUser(null)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-[#F5C518] text-gray-900 text-sm font-semibold hover:bg-[#D4A016] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile',       label: 'My Profile',      icon: User  },
  { id: 'team',          label: 'Team Management',  icon: Users },
  { id: 'notifications', label: 'Notifications',    icon: Bell  },
];

export default function AdminSettingsPage() {
  const [section, setSection] = useState<Section>('profile');

  return (
    <div className="p-8 max-w-3xl mx-auto h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
          <Settings size={18} className="text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Settings</h1>
          <p className="text-xs text-gray-400">Manage your profile and team</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-7">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setSection(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all',
                section === tab.id
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon size={13} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      {section === 'profile'       && <ProfileSection />}
      {section === 'team'          && <TeamSection />}
      {section === 'notifications' && <NotificationsSection />}
    </div>
  );
}
