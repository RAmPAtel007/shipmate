'use client';

import { useEffect, useState } from 'react';
import {
  Search, X, Pencil, Plus, Users, Building2,
  Trash2, Hash, ChevronRight, ChevronDown, ChevronUp,
  UserMinus, Check,
} from 'lucide-react';
import {
  collection, getDocs, addDoc, deleteDoc, doc,
  setDoc, getDoc, updateDoc, serverTimestamp, query, where, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { userService } from '@/lib/services/userService';
import { getRoleLabel } from '@/lib/utils/formatters';
import toast from 'react-hot-toast';
import type { ShipmateUser, UserRole } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeptRecord {
  id: string;      // Firestore doc ID (also used as slug)
  name: string;    // Display name, e.g. "Operations"
  memberCount?: number;
}

const ROLES: UserRole[] = ['super_admin', 'hr_admin', 'manager', 'employee'];

const roleBadge: Record<UserRole, string> = {
  super_admin: 'bg-red-100 text-red-700',
  hr_admin:    'bg-purple-100 text-purple-700',
  manager:     'bg-blue-100 text-blue-700',
  employee:    'bg-gray-100 text-gray-600',
};

// Gradient palette for department cards (cycles)
const DEPT_GRADIENTS = [
  'from-blue-500 to-blue-600',
  'from-violet-500 to-violet-600',
  'from-emerald-500 to-emerald-600',
  'from-rose-500 to-rose-600',
  'from-amber-500 to-amber-600',
  'from-cyan-500 to-cyan-600',
  'from-indigo-500 to-indigo-600',
  'from-pink-500 to-pink-600',
];

// ── Add Department Modal ───────────────────────────────────────────────────────

function AddDeptModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  function toSlug(s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error('Department name is required'); return; }
    const slug = toSlug(trimmed);
    if (!slug) { toast.error('Name must contain letters or numbers'); return; }
    setSaving(true);
    try {
      // Use slug as the Firestore document ID so dept.id === slug.
      // This lets us match users by their `department` field (which stores the slug).
      const deptRef = doc(db, 'departments', slug);
      const existing = await getDoc(deptRef);
      if (existing.exists()) {
        toast.error('A department with that name already exists');
        setSaving(false);
        return;
      }
      await setDoc(deptRef, {
        name: trimmed,
        slug,
        memberCount: 0,
        createdAt: serverTimestamp(),
      });
      toast.success(`"${trimmed}" department created`);
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to create department');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#F5C518]/20 rounded-lg flex items-center justify-center">
              <Building2 size={14} className="text-[#F5C518]" />
            </div>
            <h2 className="text-white font-bold text-sm">New Department</h2>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
              Department Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. Operations, Design, Sales…"
              maxLength={40}
              autoFocus
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] transition-all"
            />
            {name.trim() && (
              <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                <Hash size={10} />
                ID: <span className="font-mono text-[#1B2B5E]">{name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}</span>
              </p>
            )}
          </div>

          <div className="flex gap-2.5 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Department'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit User Modal ────────────────────────────────────────────────────────────

function EditModal({
  user,
  departments,
  onClose,
  onSaved,
}: {
  user: ShipmateUser;
  departments: DeptRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole]     = useState<UserRole>(user.role);
  const [dept, setDept]     = useState<string>(user.department ?? '');
  const [status, setStatus] = useState<'active' | 'inactive'>(user.status ?? 'active');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await userService.updateUser(user.uid, { role, department: dept as any, status });
      toast.success('User updated');
      onSaved();
      onClose();
    } catch {
      toast.error('Failed to update user');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between">
          <h2 className="text-white font-bold text-sm">Edit Team Member</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors"><X size={16} /></button>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
              {user.photoURL
                ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                : <span className="text-[#1B2B5E] text-xs font-bold">{user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
              }
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm">{user.name}</p>
              <p className="text-xs text-gray-400">{user.email}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Department</label>
              <select value={dept} onChange={e => setDept(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                <option value="">— Unassigned —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as 'active' | 'inactive')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-60 transition-colors">
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Member Row (used inside DeptManageModal) ───────────────────────────────────

function MemberRow({
  member,
  allDepts,
  onChangeRole,
  onMoveToDept,
  onRemove,
}: {
  member: ShipmateUser;
  allDepts: DeptRecord[];
  onChangeRole: (role: UserRole) => void;
  onMoveToDept: (deptId: string) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
        {member.photoURL
          ? <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          : <span className="text-[#1B2B5E] text-[10px] font-bold">{member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
        }
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-800 truncate">{member.name}</p>
        <p className="text-xs text-gray-400 truncate">{member.email}</p>
      </div>

      {/* Role select */}
      <select
        value={member.role}
        onChange={e => onChangeRole(e.target.value as UserRole)}
        className="hidden sm:block text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 text-gray-700 bg-white"
      >
        {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
      </select>

      {/* Move to another department */}
      {allDepts.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) onMoveToDept(e.target.value); }}
          className="hidden md:block text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 text-gray-600 bg-white"
        >
          <option value="">Move to…</option>
          {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      )}

      {/* Remove from dept */}
      <button
        onClick={onRemove}
        title="Remove from department"
        className="w-7 h-7 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
      >
        <UserMinus size={13} />
      </button>
    </div>
  );
}

// ── Dept Manage Modal ──────────────────────────────────────────────────────────

function DeptManageModal({
  dept,
  allUsers,
  allDepts,
  onClose,
}: {
  dept: DeptRecord;
  allUsers: ShipmateUser[];
  allDepts: DeptRecord[];
  onClose: () => void;
}) {
  const [deptName, setDeptName] = useState(dept.name);
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName]   = useState(false);
  const [addSearch, setAddSearch]     = useState('');

  // Sync displayed name when the live dept prop updates (e.g. after rename)
  useEffect(() => { setDeptName(dept.name); }, [dept.name]);

  const members    = allUsers.filter(u => u.department === dept.id);
  const nonMembers = allUsers.filter(u => u.department !== dept.id);
  const filteredNonMembers = nonMembers.filter(u => {
    const q = addSearch.toLowerCase();
    return !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  async function saveName() {
    const trimmed = deptName.trim();
    if (!trimmed) { toast.error('Name cannot be empty'); return; }
    if (trimmed === dept.name) { setEditingName(false); return; }
    setSavingName(true);
    try {
      await updateDoc(doc(db, 'departments', dept.id), { name: trimmed });
      toast.success('Department renamed');
      setEditingName(false);
    } catch {
      toast.error('Failed to rename department');
    } finally {
      setSavingName(false);
    }
  }

  async function changeRole(user: ShipmateUser, role: UserRole) {
    try {
      await userService.updateUser(user.uid, { role });
      toast.success(`${user.name}'s role updated`);
    } catch {
      toast.error('Failed to update role');
    }
  }

  async function moveToDept(user: ShipmateUser, newDeptId: string) {
    try {
      await userService.updateUser(user.uid, { department: newDeptId as any });
      const destName = allDepts.find(d => d.id === newDeptId)?.name ?? newDeptId;
      toast.success(`${user.name} moved to ${destName}`);
    } catch {
      toast.error('Failed to move member');
    }
  }

  async function removeFromDept(user: ShipmateUser) {
    try {
      await userService.updateUser(user.uid, { department: '' as any });
      toast.success(`${user.name} removed from department`);
    } catch {
      toast.error('Failed to remove member');
    }
  }

  async function addToDept(user: ShipmateUser) {
    try {
      await userService.updateUser(user.uid, { department: dept.id as any });
      toast.success(`${user.name} added to ${dept.name}`);
    } catch {
      toast.error('Failed to add member');
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal header ── */}
        <div className="bg-[#1B2B5E] px-5 py-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#F5C518]/20 flex items-center justify-center flex-shrink-0">
                <Building2 size={16} className="text-[#F5C518]" />
              </div>
              {editingName ? (
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    value={deptName}
                    onChange={e => setDeptName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveName();
                      if (e.key === 'Escape') { setDeptName(dept.name); setEditingName(false); }
                    }}
                    className="bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-1.5 text-sm font-bold focus:outline-none focus:border-white/50 w-44"
                  />
                  <button
                    onClick={saveName}
                    disabled={savingName}
                    className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                  >
                    <Check size={13} />
                  </button>
                  <button
                    onClick={() => { setDeptName(dept.name); setEditingName(false); }}
                    className="w-7 h-7 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-white font-bold truncate">{dept.name}</h2>
                  <button
                    onClick={() => setEditingName(true)}
                    title="Rename department"
                    className="text-white/40 hover:text-white transition-colors flex-shrink-0"
                  >
                    <Pencil size={12} />
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="text-white/40 text-sm hidden sm:block">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={onClose}
                className="text-white/50 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto flex-1 divide-y divide-gray-100">

          {/* Current Members */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Current Members
              <span className="ml-2 text-gray-300 normal-case font-normal">{members.length}</span>
            </p>
            {members.length === 0 ? (
              <div className="text-center py-8">
                <Users size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No members in this department yet.</p>
                <p className="text-xs text-gray-300 mt-1">Use "Add Members" below to assign people.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {members.map(member => (
                  <MemberRow
                    key={member.uid}
                    member={member}
                    allDepts={allDepts.filter(d => d.id !== dept.id)}
                    onChangeRole={role => changeRole(member, role)}
                    onMoveToDept={newDeptId => moveToDept(member, newDeptId)}
                    onRemove={() => removeFromDept(member)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add Members */}
          <div className="p-5">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Add Members
              <span className="ml-2 text-gray-300 normal-case font-normal">{nonMembers.length} available</span>
            </p>
            {nonMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                All team members are already in this department.
              </p>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={addSearch}
                    onChange={e => setAddSearch(e.target.value)}
                    placeholder="Search by name or email…"
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
                  />
                  {addSearch && (
                    <button
                      onClick={() => setAddSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {filteredNonMembers.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">No results</p>
                  ) : (
                    filteredNonMembers.map(u => (
                      <div
                        key={u.uid}
                        className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {u.photoURL
                            ? <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            : <span className="text-[#1B2B5E] text-[10px] font-bold">{u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                        {u.department && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0 hidden sm:block">
                            {allDepts.find(d => d.id === u.department)?.name ?? u.department}
                          </span>
                        )}
                        <button
                          onClick={() => addToDept(u)}
                          className="flex-shrink-0 flex items-center gap-1.5 bg-[#1B2B5E] text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#2D4080] transition-colors"
                        >
                          <Plus size={11} />
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
          <button
            onClick={onClose}
            className="w-full py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [tab, setTab] = useState<'members' | 'departments'>('members');

  const [users, setUsers]             = useState<ShipmateUser[]>([]);
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [deptLoading, setDeptLoading] = useState(true);

  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState<UserRole | 'all'>('all');
  const [deptFilter, setDeptFilter]   = useState<string>('all');

  const [editingUser, setEditingUser]   = useState<ShipmateUser | null>(null);
  const [showAddDept, setShowAddDept]   = useState(false);
  const [expandedDeptId, setExpandedDeptId] = useState<string | null>(null);
  const [managingDept, setManagingDept] = useState<DeptRecord | null>(null);

  // ── Real-time listeners ───────────────────────────────────────────────────────

  useEffect(() => {
    // Live users
    setLoading(true);
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      snap => {
        setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ShipmateUser)));
        setLoading(false);
      },
      err => { console.error('[users]', err); setLoading(false); }
    );

    // Live departments
    setDeptLoading(true);
    const unsubDepts = onSnapshot(
      collection(db, 'departments'),
      async snap => {
        const rawDocs = snap.docs.map(d => ({ _ref: d.ref, id: d.id, ...(d.data() as any) }));

        // ── One-time seed: ensure the 4 legacy departments exist with slug-as-ID ──
        const SEED = [
          { id: 'ai-team',   name: 'AI Team' },
          { id: 'marketing', name: 'Marketing' },
          { id: 'finance',   name: 'Finance' },
          { id: 'hr',        name: 'HR' },
        ];
        const existingIds = new Set(rawDocs.map((d: any) => d.id));
        const missing = SEED.filter(s => !existingIds.has(s.id));
        if (missing.length > 0) {
          await Promise.all(missing.map(s =>
            setDoc(doc(db, 'departments', s.id), {
              name: s.name, slug: s.id, memberCount: 0, createdAt: serverTimestamp(),
            }, { merge: true })
          ));
        }

        // ── Migrate any auto-ID docs (where Firestore ID ≠ slug) ──
        // These are docs created via addDoc() before the setDoc-with-slug fix.
        // Strategy: if a proper slug-based doc already exists → delete the dupe.
        //           if not → recreate under the slug ID then delete the old one.
        const autoIdDocs = rawDocs.filter((d: any) => {
          const slug: string = d.slug ?? '';
          return slug && d.id !== slug;
        });
        if (autoIdDocs.length > 0) {
          await Promise.all(autoIdDocs.map(async (d: any) => {
            const slug: string = d.slug;
            const slugRef = doc(db, 'departments', slug);
            const existing = await getDoc(slugRef);
            if (!existing.exists()) {
              // Recreate with correct ID, preserving name and other fields
              await setDoc(slugRef, {
                name: d.name,
                slug,
                memberCount: d.memberCount ?? 0,
                createdAt: d.createdAt ?? serverTimestamp(),
              });
            }
            // Delete the old auto-ID document
            await deleteDoc(d._ref);
          }));
          // onSnapshot will fire again — no need to set state here
          return;
        }

        const docs: DeptRecord[] = rawDocs.map(({ _ref, ...rest }: any) => rest as DeptRecord);
        docs.sort((a, b) => a.name.localeCompare(b.name));
        setDepartments(docs);
        setDeptLoading(false);
      },
      err => { console.error('[depts]', err); setDeptLoading(false); }
    );

    return () => { unsubUsers(); unsubDepts(); };
  }, []);

  // Keep for EditModal save callback (no manual reload needed — onSnapshot auto-updates)
  function loadUsers() { /* no-op — live listener handles it */ }

  // ── Delete department ─────────────────────────────────────────────────────────

  async function handleDeleteDept(dept: DeptRecord) {
    const membersInDept = usersInDept(dept.id, (dept as any).slug).length;
    if (membersInDept > 0) {
      toast.error(`Cannot delete — ${membersInDept} member${membersInDept > 1 ? 's' : ''} still in this department`);
      return;
    }
    if (!confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'departments', dept.id));
      toast.success(`"${dept.name}" deleted`);
      // onSnapshot auto-updates the list — no manual reload needed
    } catch {
      toast.error('Failed to delete department');
    }
  }

  // ── Filtered users ────────────────────────────────────────────────────────────

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    const matchDept = deptFilter === 'all' || u.department === deptFilter;
    return matchSearch && matchRole && matchDept;
  });

  // Match user → department:
  // dept.id IS the slug (e.g. "ai-team") because we now use setDoc with slug as doc ID.
  // u.department stores the same slug value, so the comparison is direct.
  // Fallback: also match by dept.slug field for any legacy auto-ID docs still in Firestore.
  function usersInDept(deptId: string, deptSlug?: string) {
    return users.filter(u => u.department === deptId || (deptSlug && u.department === deptSlug));
  }

  const deptsWithCounts = departments.map(d => ({
    ...d,
    memberCount: usersInDept(d.id, (d as any).slug).length,
  }));

  function getDeptName(deptId: string) {
    return departments.find(d => d.id === deptId || (d as any).slug === deptId)?.name ?? deptId;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto bg-gray-50/60">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1B2B5E] via-[#1e3270] to-[#0D1832]">
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)', backgroundSize: '24px 24px' }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Team Management</h1>
              <p className="text-white/40 text-sm mt-1">
                {users.length} members · {departments.length} department{departments.length !== 1 ? 's' : ''}
              </p>
            </div>
            {tab === 'departments' && (
              <button
                onClick={() => setShowAddDept(true)}
                className="flex items-center gap-2 bg-[#F5C518] hover:bg-[#f0bc00] text-[#1B2B5E] text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-lg shadow-[#F5C518]/20 flex-shrink-0"
              >
                <Plus size={15} />
                New Department
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5">
            {[
              { key: 'members', label: 'Team Members', icon: Users },
              { key: 'departments', label: 'Departments', icon: Building2 },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  tab === key
                    ? 'bg-white text-[#1B2B5E]'
                    : 'text-white/50 hover:text-white hover:bg-white/8'
                }`}
              >
                <Icon size={14} />
                {label}
                {key === 'members' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === key ? 'bg-[#1B2B5E]/10 text-[#1B2B5E]' : 'bg-white/10 text-white/50'
                  }`}>{users.length}</span>
                )}
                {key === 'departments' && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === key ? 'bg-[#1B2B5E]/10 text-[#1B2B5E]' : 'bg-white/10 text-white/50'
                  }`}>{departments.length}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">

        {/* ══ TEAM MEMBERS TAB ══════════════════════════════════════════════ */}
        {tab === 'members' && (
          <>
            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or email…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value as any)}
                className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 text-gray-700"
              >
                <option value="all">All Roles</option>
                {ROLES.map(r => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
              </select>
              <select
                value={deptFilter}
                onChange={e => setDeptFilter(e.target.value)}
                className="px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 text-gray-700"
              >
                <option value="all">All Departments</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">User</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Role</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Department</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full shimmer flex-shrink-0" />
                            <div className="space-y-1.5">
                              <div className="h-3.5 w-28 rounded shimmer" />
                              <div className="h-3 w-36 rounded shimmer" />
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell"><div className="h-5 w-20 rounded-full shimmer" /></td>
                        <td className="px-6 py-4 hidden md:table-cell"><div className="h-4 w-20 rounded shimmer" /></td>
                        <td className="px-6 py-4"><div className="h-5 w-14 rounded-full shimmer" /></td>
                        <td className="px-6 py-4"><div className="h-8 w-8 rounded-lg shimmer" /></td>
                      </tr>
                    ))
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No users found</td>
                    </tr>
                  ) : (
                    filtered.map(user => (
                      <tr key={user.uid} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                              {user.photoURL
                                ? <img src={user.photoURL} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                : <span className="text-[#1B2B5E] text-xs font-bold">{user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</span>
                              }
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-800">{user.name}</p>
                              <p className="text-xs text-gray-400">{user.email}</p>
                              {/* Mobile-only dept + role */}
                              <p className="text-[11px] text-gray-300 mt-0.5 sm:hidden">{getRoleLabel(user.role)} · {getDeptName(user.department)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden sm:table-cell">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleBadge[user.role]}`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell">
                          <span className="text-sm text-gray-600">{getDeptName(user.department)}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${user.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {user.status === 'active' ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => setEditingUser(user)}
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1B2B5E] transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══ DEPARTMENTS TAB ═══════════════════════════════════════════════ */}
        {tab === 'departments' && (
          <div>
            {deptLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 space-y-3">
                    <div className="h-10 w-10 rounded-xl shimmer" />
                    <div className="h-4 w-28 rounded shimmer" />
                    <div className="h-3 w-16 rounded shimmer" />
                  </div>
                ))}
              </div>
            ) : deptsWithCounts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
                <div className="w-14 h-14 bg-[#1B2B5E]/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Building2 size={24} className="text-[#1B2B5E]/40" />
                </div>
                <h3 className="font-bold text-gray-700 mb-1">No departments yet</h3>
                <p className="text-sm text-gray-400 mb-5">Create your first department to organize your team.</p>
                <button
                  onClick={() => setShowAddDept(true)}
                  className="inline-flex items-center gap-2 bg-[#1B2B5E] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#2D4080] transition-colors"
                >
                  <Plus size={14} />
                  Create First Department
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {deptsWithCounts.map((dept, idx) => {
                  const gradient = DEPT_GRADIENTS[idx % DEPT_GRADIENTS.length];
                  const initial = dept.name[0].toUpperCase();
                  const isExpanded = expandedDeptId === dept.id;
                  const deptMembers = usersInDept(dept.id, (dept as any).slug);

                  return (
                    <div
                      key={dept.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md hover:border-gray-200 transition-all group"
                    >
                      {/* Color banner */}
                      <div className={`bg-gradient-to-r ${gradient} h-2`} />

                      <div className="p-5">
                        <div className="flex items-start justify-between mb-4">
                          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm`}>
                            <span className="text-white font-black text-lg">{initial}</span>
                          </div>
                          <button
                            onClick={() => handleDeleteDept(dept)}
                            className="w-7 h-7 rounded-lg text-gray-300 hover:bg-red-50 hover:text-red-500 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                            title="Delete department"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <h3 className="font-bold text-gray-900 text-base leading-tight">{dept.name}</h3>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{dept.id}</p>

                        {/* Live member count + expand toggle */}
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                          <button
                            onClick={() => setExpandedDeptId(isExpanded ? null : dept.id)}
                            className="flex items-center gap-1.5 hover:text-[#1B2B5E] transition-colors group/toggle"
                          >
                            <div className="flex items-center gap-1.5">
                              {/* Live avatar stack */}
                              <div className="flex -space-x-1.5">
                                {deptMembers.slice(0, 3).map(m => (
                                  <div
                                    key={m.uid}
                                    className="w-5 h-5 rounded-full border-2 border-white bg-[#1B2B5E]/10 flex items-center justify-center overflow-hidden"
                                  >
                                    {m.photoURL
                                      ? <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      : <span className="text-[#1B2B5E] text-[8px] font-bold">{m.name[0]}</span>
                                    }
                                  </div>
                                ))}
                              </div>
                              <span className="text-sm font-semibold text-gray-700 group-hover/toggle:text-[#1B2B5E]">
                                {dept.memberCount} member{dept.memberCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {deptMembers.length > 0 && (
                              isExpanded
                                ? <ChevronUp size={13} className="text-gray-400" />
                                : <ChevronDown size={13} className="text-gray-400" />
                            )}
                          </button>
                          <button
                            onClick={() => setManagingDept(dept)}
                            className="flex items-center gap-1 text-xs font-bold text-[#1B2B5E] hover:text-[#2D4080] transition-colors"
                          >
                            Manage <ChevronRight size={11} />
                          </button>
                        </div>

                        {/* ── Expandable live employee list ── */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                            {deptMembers.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-2">No members yet</p>
                            ) : (
                              deptMembers.map(m => (
                                <div key={m.uid} className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-[#1B2B5E]/8 flex items-center justify-center overflow-hidden flex-shrink-0">
                                    {m.photoURL
                                      ? <img src={m.photoURL} alt={m.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                      : <span className="text-[#1B2B5E] text-[10px] font-bold">{m.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                                    }
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800 truncate">{m.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">{m.email}</p>
                                  </div>
                                  <span className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${roleBadge[m.role]}`}>
                                    {getRoleLabel(m.role)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Add new card */}
                <button
                  onClick={() => setShowAddDept(true)}
                  className="bg-white rounded-2xl border-2 border-dashed border-gray-200 hover:border-[#1B2B5E]/30 hover:bg-[#1B2B5E]/2 p-5 flex flex-col items-center justify-center gap-3 transition-all group min-h-[160px]"
                >
                  <div className="w-11 h-11 rounded-xl bg-gray-100 group-hover:bg-[#1B2B5E]/8 flex items-center justify-center transition-colors">
                    <Plus size={20} className="text-gray-400 group-hover:text-[#1B2B5E] transition-colors" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-gray-500 group-hover:text-[#1B2B5E] transition-colors">Add Department</p>
                    <p className="text-xs text-gray-400 mt-0.5">Create a new team group</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* Modals */}
      {editingUser && (
        <EditModal
          user={editingUser}
          departments={departments}
          onClose={() => setEditingUser(null)}
          onSaved={loadUsers}  // no-op — onSnapshot auto-updates
        />
      )}
      {showAddDept && (
        <AddDeptModal
          onClose={() => setShowAddDept(false)}
          onAdded={() => {}}  // no-op — onSnapshot auto-updates both collections
        />
      )}
      {managingDept && (
        <DeptManageModal
          dept={departments.find(d => d.id === managingDept.id) ?? managingDept}
          allUsers={users}
          allDepts={departments}
          onClose={() => setManagingDept(null)}
        />
      )}
    </div>
  );
}
