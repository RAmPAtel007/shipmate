'use client';

import { useEffect, useState } from 'react';
import { Hash, Plus, Archive, ArchiveRestore, ChevronDown, ChevronRight, X } from 'lucide-react';

import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils/cn';
import toast from 'react-hot-toast';
import type { Channel } from '@/lib/types';

interface DeptRecord { id: string; name: string; }

function CreateModal({
  onClose, onCreated, departments,
}: { onClose: () => void; onCreated: () => void; departments: DeptRecord[] }) {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'department'>('public');
  const [dept, setDept] = useState(departments[0]?.id ?? '');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!name.trim() || !currentUser) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'channels'), {
        name: name.trim().toLowerCase().replace(/\s+/g, '-'),
        type,
        departmentId: type === 'department' ? dept : null,
        description: description.trim(),
        members: [],
        createdBy: currentUser.uid,
        isArchived: false,
        createdAt: serverTimestamp(),
      });
      toast.success('Channel created');
      onCreated();
      onClose();
    } catch { toast.error('Failed to create channel'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 text-base">Create Channel</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Channel Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. general" required
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Type</label>
            <select value={type} onChange={e => setType(e.target.value as any)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
              <option value="public">Public (visible to all)</option>
              <option value="department">Department</option>
            </select>
          </div>
          {type === 'department' && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Department</label>
              {departments.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  No departments yet — add them in Admin Settings first.
                </p>
              ) : (
                <select value={dept} onChange={e => setDept(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]">
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Description (optional)</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="What's this channel for?"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]" />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={create} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

const TYPE_COLOR: Record<string, string> = {
  public:     'bg-blue-100 text-blue-700',
  department: 'bg-purple-100 text-purple-700',
};

function ChannelRow({ channel, onToggleArchive, departments }: { channel: Channel; onToggleArchive: (c: Channel) => void; departments: DeptRecord[] }) {
  const deptName = channel.departmentId
    ? (departments.find(d => d.id === channel.departmentId)?.name ?? channel.departmentId)
    : '—';
  return (
    <tr className="hover:bg-gray-50/60 transition-colors">
      <td className="px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[#1B2B5E]/8 rounded-lg flex items-center justify-center">
            <Hash size={14} className="text-[#1B2B5E]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">{channel.name}</p>
            {channel.description && (
              <p className="text-xs text-gray-400 truncate max-w-[200px]">{channel.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${TYPE_COLOR[channel.type] ?? 'bg-gray-100 text-gray-600'}`}>
          {channel.type}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600">{deptName}</span>
      </td>
      <td className="px-6 py-4 text-right">
        <button
          onClick={() => onToggleArchive(channel)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors ml-auto"
        >
          <Archive size={12} />
          Archive
        </button>
      </td>
    </tr>
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 4 }).map((_, j) => (
            <td key={j} className="px-6 py-4"><div className="h-4 rounded shimmer" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default function AdminChannelsPage() {
  const [channels, setChannels]       = useState<Channel[]>([]);
  const [departments, setDepartments] = useState<DeptRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'channels'));
      setChannels(snap.docs.map(d => ({ id: d.id, ...d.data() } as Channel)));
    } finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // Live departments listener — updates as admin adds/removes departments
    const unsub = onSnapshot(collection(db, 'departments'), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, name: d.data().name as string }));
      docs.sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(docs);
    });
    return () => unsub();
  }, []);

  async function toggleArchive(channel: Channel) {
    await updateDoc(doc(db, 'channels', channel.id), { isArchived: !channel.isArchived });
    toast.success(channel.isArchived ? 'Channel restored' : 'Channel archived');
    load();
  }

  const active   = channels.filter(c => !c.isArchived && c.type !== 'dm');
  const archived = channels.filter(c => c.isArchived  && c.type !== 'dm');

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Channels</h1>
          <p className="text-gray-500 mt-1">{active.length} active · {archived.length} archived</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors shadow-sm"
        >
          <Plus size={16} />
          New Channel
        </button>
      </div>

      {/* ── Active channels ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <h2 className="text-sm font-bold text-gray-700">Active Channels</h2>
          <span className="ml-auto text-xs text-gray-400 font-medium">{active.length}</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-50">
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <SkeletonRows />
            ) : active.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-gray-400 text-sm">
                  No active channels. Create one above.
                </td>
              </tr>
            ) : (
              active.map(channel => (
                <ChannelRow key={channel.id} channel={channel} onToggleArchive={toggleArchive} departments={departments} />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Archived channels ─────────────────────────────────────────────────── */}
      {archived.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Collapsible header */}
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
            <div className="border-t border-gray-100">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-50 bg-gray-50/50">
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Channel</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase tracking-wider">Department</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {archived.map(channel => (
                    <tr key={channel.id} className="hover:bg-gray-50/60 transition-colors opacity-70">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                            <Hash size={14} className="text-gray-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-500">{channel.name}</p>
                            {channel.description && (
                              <p className="text-xs text-gray-400 truncate max-w-[200px]">{channel.description}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize bg-gray-100 text-gray-500">
                          {channel.type}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400">
                          {channel.departmentId
                            ? (departments.find(d => d.id === channel.departmentId)?.name ?? channel.departmentId)
                            : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => toggleArchive(channel)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-emerald-600 hover:border-emerald-200 transition-colors ml-auto"
                        >
                          <ArchiveRestore size={12} />
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} departments={departments} />}
    </div>
  );
}
