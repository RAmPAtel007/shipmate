'use client';

import { useEffect, useState } from 'react';
import {
  Hash, Plus, Archive, ArchiveRestore, ChevronDown, ChevronRight, X,
  Pencil, Trash2, Users, Search, UserPlus, UserMinus, Settings2,
  AlertTriangle, Check,
} from 'lucide-react';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { Channel } from '@/lib/types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeptRecord { id: string; name: string; }
interface UserRecord  { uid: string; name: string; email: string; photoURL?: string | null; department?: string; }

// ── Shared helpers ─────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  public:     'bg-blue-100 text-blue-700',
  department: 'bg-purple-100 text-purple-700',
};

function Avatar({ user, size = 'sm' }: { user: UserRecord; size?: 'sm' | 'md' }) {
  const dim  = size === 'sm' ? 'w-7 h-7 text-[9px]' : 'w-9 h-9 text-xs';
  const init = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return user.photoURL ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={user.photoURL} alt={user.name} className={`${dim} rounded-full object-cover flex-shrink-0`} referrerPolicy="no-referrer" />
  ) : (
    <div className={`${dim} rounded-full bg-[#1B2B5E]/10 flex items-center justify-center font-bold text-[#1B2B5E] flex-shrink-0`}>
      {init}
    </div>
  );
}

// ── Create / Edit Modal ────────────────────────────────────────────────────────

type ModalTab = 'general' | 'members';

function ChannelModal({
  channel,
  departments,
  allUsers,
  onClose,
  onSaved,
}: {
  channel?: Channel;          // undefined = create mode
  departments: DeptRecord[];
  allUsers: UserRecord[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser } = useAuth();
  const isEdit = !!channel;
  const [tab, setTab] = useState<ModalTab>('general');

  // General fields
  const [name,        setName]        = useState(channel?.name        ?? '');
  const [type,        setType]        = useState<'public'|'department'>(
    (channel?.type === 'department' ? 'department' : 'public') as 'public'|'department',
  );
  const [dept,        setDept]        = useState(channel?.departmentId ?? departments[0]?.id ?? '');
  const [description, setDescription] = useState(channel?.description ?? '');
  const [saving,      setSaving]      = useState(false);

  // Members tab
  const [memberIds,   setMemberIds]   = useState<string[]>(channel?.members ?? []);
  const [memberSearch, setMemberSearch] = useState('');

  const members    = allUsers.filter(u => memberIds.includes(u.uid));
  const nonMembers = allUsers.filter(u => !memberIds.includes(u.uid) &&
    u.name.toLowerCase().includes(memberSearch.toLowerCase()));

  async function save() {
    if (!name.trim() || !currentUser) return;
    setSaving(true);
    try {
      const cleanName = name.trim().toLowerCase().replace(/\s+/g, '-');
      if (isEdit) {
        await updateDoc(doc(db, 'channels', channel!.id), {
          name:         cleanName,
          type,
          departmentId: type === 'department' ? dept : null,
          description:  description.trim(),
          members:      memberIds,
        });
        toast.success('Channel updated');
      } else {
        await addDoc(collection(db, 'channels'), {
          name:         cleanName,
          type,
          departmentId: type === 'department' ? dept : null,
          description:  description.trim(),
          members:      memberIds,
          createdBy:    currentUser.uid,
          isArchived:   false,
          createdAt:    serverTimestamp(),
        });
        toast.success('Channel created');
      }
      onSaved();
      onClose();
    } catch { toast.error('Failed to save channel'); }
    finally  { setSaving(false); }
  }

  function addMember(uid: string)    { setMemberIds(ids => [...ids, uid]); setMemberSearch(''); }
  function removeMember(uid: string) { setMemberIds(ids => ids.filter(id => id !== uid)); }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B2B5E]/8 flex items-center justify-center">
              <Hash size={15} className="text-[#1B2B5E]" />
            </div>
            <h2 className="font-bold text-gray-900 text-base">
              {isEdit ? `Edit #${channel!.name}` : 'Create Channel'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Tabs — only show in edit mode */}
        {isEdit && (
          <div className="flex border-b border-gray-100 px-6 flex-shrink-0">
            {(['general', 'members'] as ModalTab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-3 px-1 mr-5 text-sm font-semibold border-b-2 capitalize transition-colors ${
                  tab === t
                    ? 'border-[#1B2B5E] text-[#1B2B5E]'
                    : 'border-transparent text-gray-400 hover:text-gray-700'
                }`}
              >
                {t === 'members' ? `Members (${memberIds.length})` : t}
              </button>
            ))}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── General Tab ───────────────────────────────────────────── */}
          {tab === 'general' && (
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Channel Name</label>
                <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3.5 py-2.5 focus-within:border-[#1B2B5E] focus-within:ring-2 focus-within:ring-[#1B2B5E]/10 transition-all">
                  <Hash size={14} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. general"
                    className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800 placeholder:text-gray-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What's this channel for?"
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/10 focus:border-[#1B2B5E] resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Channel Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['public', 'department'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        type === t
                          ? 'border-[#1B2B5E] bg-[#1B2B5E]/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-bold capitalize ${type === t ? 'text-[#1B2B5E]' : 'text-gray-700'}`}>{t}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {t === 'public' ? 'Visible to all employees' : 'Restricted to a department'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {type === 'department' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Department</label>
                  {departments.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                      No departments yet — add them in Admin Settings first.
                    </p>
                  ) : (
                    <select
                      value={dept}
                      onChange={e => setDept(e.target.value)}
                      className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/10 focus:border-[#1B2B5E]"
                    >
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Members preview when creating */}
              {!isEdit && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Add Members <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                      <Search size={13} className="text-gray-400" />
                      <input
                        type="text"
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search users to add…"
                        className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
                      />
                    </div>
                    <div className="max-h-36 overflow-y-auto divide-y divide-gray-50">
                      {members.length === 0 && memberSearch === '' && (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">Search for users to add them</p>
                      )}
                      {/* Selected members */}
                      {members.map(u => (
                        <div key={u.uid} className="flex items-center gap-2.5 px-3 py-2 bg-[#1B2B5E]/3">
                          <Avatar user={u} />
                          <span className="flex-1 text-sm text-gray-800">{u.name}</span>
                          <button onClick={() => removeMember(u.uid)} className="text-gray-400 hover:text-red-500 transition-colors">
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                      {/* Searchable non-members */}
                      {memberSearch && nonMembers.slice(0, 6).map(u => (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => addMember(u.uid)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
                        >
                          <Avatar user={u} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-800">{u.name}</p>
                            <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                          </div>
                          <UserPlus size={13} className="text-[#1B2B5E] flex-shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Members Tab (edit mode only) ──────────────────────────── */}
          {tab === 'members' && (
            <div className="p-6 space-y-4">

              {/* Add member search */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Add Member</label>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    <Search size={13} className="text-gray-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={memberSearch}
                      onChange={e => setMemberSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="flex-1 text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
                    />
                  </div>
                  {memberSearch && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50 max-h-44 overflow-y-auto">
                      {nonMembers.slice(0, 8).length === 0 ? (
                        <p className="px-3 py-3 text-xs text-gray-400 text-center">No users found</p>
                      ) : nonMembers.slice(0, 8).map(u => (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() => addMember(u.uid)}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                        >
                          <Avatar user={u} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{u.name}</p>
                            <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                          </div>
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#1B2B5E] bg-[#1B2B5E]/8 px-2 py-0.5 rounded-full">
                            <UserPlus size={10} /> Add
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Current members list */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">
                  Current Members <span className="text-gray-400 font-normal">({members.length})</span>
                </p>
                <div className="border border-gray-200 rounded-xl divide-y divide-gray-50 overflow-hidden">
                  {members.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">No members yet</p>
                  ) : (
                    members.map(u => (
                      <div key={u.uid} className="flex items-center gap-3 px-4 py-3">
                        <Avatar user={u} size="md" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{u.name}</p>
                          <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMember(u.uid)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                        >
                          <UserMinus size={12} /> Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
            ) : (
              <Check size={14} />
            )}
            {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Channel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ────────────────────────────────────────────────────────

function DeleteConfirm({
  channel,
  onClose,
  onDeleted,
}: {
  channel: Channel;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (confirm !== channel.name) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'channels', channel.id));
      toast.success(`#${channel.name} deleted`);
      onDeleted();
      onClose();
    } catch { toast.error('Failed to delete channel'); }
    finally  { setDeleting(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mb-4 mx-auto">
          <AlertTriangle size={22} className="text-red-600" />
        </div>
        <h2 className="text-base font-bold text-gray-900 text-center mb-1">Delete Channel?</h2>
        <p className="text-sm text-gray-500 text-center mb-5 leading-relaxed">
          This will permanently delete <span className="font-semibold text-gray-700">#{channel.name}</span> and all its messages. This cannot be undone.
        </p>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Type <span className="text-gray-800 font-bold">{channel.name}</span> to confirm
          </label>
          <input
            type="text"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={channel.name}
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition-all"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={confirm !== channel.name || deleting}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Channel Row ────────────────────────────────────────────────────────────────

function ChannelRow({
  channel,
  departments,
  allUsers,
  onEdit,
  onDelete,
  onToggleArchive,
}: {
  channel: Channel;
  departments: DeptRecord[];
  allUsers: UserRecord[];
  onEdit: (c: Channel) => void;
  onDelete: (c: Channel) => void;
  onToggleArchive: (c: Channel) => void;
}) {
  const deptName   = channel.departmentId
    ? (departments.find(d => d.id === channel.departmentId)?.name ?? channel.departmentId)
    : '—';
  const memberCount = channel.members?.length ?? 0;
  const memberAvatars = allUsers.filter(u => channel.members?.includes(u.uid)).slice(0, 4);

  return (
    <tr className="hover:bg-gray-50/60 transition-colors group">
      {/* Name + description */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            channel.isArchived ? 'bg-gray-100' : 'bg-[#1B2B5E]/8'
          }`}>
            <Hash size={14} className={channel.isArchived ? 'text-gray-400' : 'text-[#1B2B5E]'} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${channel.isArchived ? 'text-gray-400' : 'text-gray-800'}`}>
              {channel.name}
            </p>
            {channel.description && (
              <p className="text-xs text-gray-400 truncate max-w-[220px]">{channel.description}</p>
            )}
          </div>
        </div>
      </td>

      {/* Type */}
      <td className="px-6 py-4">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
          channel.isArchived ? 'bg-gray-100 text-gray-400' : (TYPE_COLOR[channel.type] ?? 'bg-gray-100 text-gray-600')
        }`}>
          {channel.type}
        </span>
      </td>

      {/* Department */}
      <td className="px-6 py-4">
        <span className={`text-sm ${channel.isArchived ? 'text-gray-400' : 'text-gray-600'}`}>{deptName}</span>
      </td>

      {/* Members */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          {memberAvatars.length > 0 ? (
            <div className="flex -space-x-1.5">
              {memberAvatars.map(u => (
                <div key={u.uid} className="w-6 h-6 rounded-full border-2 border-white overflow-hidden bg-[#1B2B5E]/10 flex items-center justify-center">
                  {u.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.photoURL} alt={u.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="text-[7px] font-bold text-[#1B2B5E]">
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          <span className="text-xs text-gray-500 font-medium">
            {memberCount} {memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>
      </td>

      {/* Actions */}
      <td className="px-6 py-4">
        <div className="flex items-center gap-1.5 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Edit */}
          <button
            onClick={() => onEdit(channel)}
            title="Edit channel"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors"
          >
            <Settings2 size={13} />
            Edit
          </button>

          {/* Archive / Restore */}
          <button
            onClick={() => onToggleArchive(channel)}
            title={channel.isArchived ? 'Restore' : 'Archive'}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              channel.isArchived
                ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {channel.isArchived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            {channel.isArchived ? 'Restore' : 'Archive'}
          </button>

          {/* Delete */}
          <button
            onClick={() => onDelete(channel)}
            title="Delete channel"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
          >
            <Trash2 size={13} />
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 5 }).map((_, j) => (
            <td key={j} className="px-6 py-4">
              <div className="h-4 rounded-lg shimmer" style={{ width: j === 0 ? '60%' : '40%' }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminChannelsPage() {
  const [channels,    setChannels]    = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [allUsers,    setAllUsers]    = useState<UserRecord[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);

  // Modal states
  const [editChannel,   setEditChannel]   = useState<Channel | null>(null);
  const [deleteChannel, setDeleteChannel] = useState<Channel | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);

  // Live subscriptions
  useEffect(() => {
    const unsubChannels = onSnapshot(collection(db, 'channels'), snap => {
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Channel)));
      setLoading(false);
    });

    const unsubDepts = onSnapshot(collection(db, 'departments'), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
      docs.sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(docs);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      setAllUsers(
        snap.docs
          .map(d => ({
            uid:        d.id,
            name:       d.data().name       ?? '',
            email:      d.data().email      ?? '',
            photoURL:   d.data().photoURL   ?? null,
            department: d.data().department ?? '',
          } as UserRecord))
          .filter(u => u.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });

    return () => { unsubChannels(); unsubDepts(); unsubUsers(); };
  }, []);

  async function toggleArchive(channel: Channel) {
    await updateDoc(doc(db, 'channels', channel.id), { isArchived: !channel.isArchived });
    toast.success(channel.isArchived ? 'Channel restored' : 'Channel archived');
  }

  const active   = channels.filter(c => !c.isArchived && c.type !== 'dm');
  const archived = channels.filter(c =>  c.isArchived && c.type !== 'dm');

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Channels</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {active.length} active · {archived.length} archived · {allUsers.length} users
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Channel
        </button>
      </div>

      {/* ── Active Channels ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
          <h2 className="text-sm font-bold text-gray-700">Active Channels</h2>
          <span className="ml-auto text-xs text-gray-400 font-medium">{active.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50 bg-gray-50/40">
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Members</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <SkeletonRows />
              ) : active.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-14 text-center">
                    <Hash size={24} className="text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">No active channels. Create one above.</p>
                  </td>
                </tr>
              ) : (
                active.map(ch => (
                  <ChannelRow
                    key={ch.id}
                    channel={ch}
                    departments={departments}
                    allUsers={allUsers}
                    onEdit={setEditChannel}
                    onDelete={setDeleteChannel}
                    onToggleArchive={toggleArchive}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Archived Channels ───────────────────────────────────────────────── */}
      {archived.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setArchiveOpen(o => !o)}
            className="w-full flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition-colors"
          >
            <Archive size={15} className="text-gray-400" />
            <h2 className="text-sm font-bold text-gray-500">Archived Channels</h2>
            <span className="ml-2 text-xs bg-gray-100 text-gray-500 font-semibold px-2 py-0.5 rounded-full">
              {archived.length}
            </span>
            <div className="ml-auto text-gray-400">
              {archiveOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          </button>

          {archiveOpen && (
            <div className="border-t border-gray-100 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Members</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 opacity-75">
                  {archived.map(ch => (
                    <ChannelRow
                      key={ch.id}
                      channel={ch}
                      departments={departments}
                      allUsers={allUsers}
                      onEdit={setEditChannel}
                      onDelete={setDeleteChannel}
                      onToggleArchive={toggleArchive}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}

      {showCreate && (
        <ChannelModal
          departments={departments}
          allUsers={allUsers}
          onClose={() => setShowCreate(false)}
          onSaved={() => {}}
        />
      )}

      {editChannel && (
        <ChannelModal
          channel={editChannel}
          departments={departments}
          allUsers={allUsers}
          onClose={() => setEditChannel(null)}
          onSaved={() => {}}
        />
      )}

      {deleteChannel && (
        <DeleteConfirm
          channel={deleteChannel}
          onClose={() => setDeleteChannel(null)}
          onDeleted={() => {}}
        />
      )}
    </div>
  );
}
