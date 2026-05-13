'use client';

import { useEffect, useState } from 'react';
import { Plus, Pin, Trash2, Megaphone, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { announcementService } from '@/lib/services/announcementService';
import { formatDate } from '@/lib/utils/formatters';
import toast from 'react-hot-toast';
import type { Announcement } from '@/lib/types';

function ComposeModal({ onClose, onPosted }: { onClose: () => void; onPosted: () => void }) {
  const { currentUser } = useAuth();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  async function post() {
    if (!title.trim() || !body.trim() || !currentUser) return;
    setSaving(true);
    try {
      await announcementService.createAnnouncement({ title: title.trim(), body: body.trim(), authorId: currentUser.uid, authorName: currentUser.name, isPinned: pinned });
      toast.success('Announcement posted!');
      onPosted();
      onClose();
    } catch { toast.error('Failed to post'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-[#1B2B5E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-[#F5C518]" />
            <h2 className="text-white font-bold">New Announcement</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Announcement title…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Message</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5} placeholder="Write your announcement…"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] resize-none" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setPinned(!pinned)}
              className={`w-10 h-5 rounded-full transition-colors flex items-center ${pinned ? 'bg-amber-400' : 'bg-gray-200'}`}>
              <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${pinned ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <span className="text-sm text-gray-700 font-medium">Pin this announcement</span>
          </label>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
            <button onClick={post} disabled={!title.trim() || !body.trim() || saving}
              className="flex-1 py-3 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50">
              {saving ? 'Posting…' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await announcementService.getAnnouncements(100);
      setItems(data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handlePin(id: string, pinned: boolean) {
    await announcementService.togglePin(id, pinned);
    setItems(prev => prev.map(a => a.id === id ? { ...a, isPinned: pinned } : a));
    toast.success(pinned ? 'Pinned' : 'Unpinned');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await announcementService.deleteAnnouncement(id);
    setItems(prev => prev.filter(a => a.id !== id));
    toast.success('Deleted');
  }

  return (
    <div className="p-8 max-w-5xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-gray-500 mt-1">{items.length} total</p>
        </div>
        <button onClick={() => setShowCompose(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors shadow-sm">
          <Plus size={16} />
          Post Announcement
        </button>
      </div>

      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 space-y-2 border border-gray-100">
              <div className="h-4 w-48 rounded shimmer" />
              <div className="h-3 w-full rounded shimmer" />
              <div className="h-3 w-3/4 rounded shimmer" />
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Megaphone size={28} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No announcements yet</p>
            <p className="text-gray-400 text-sm mt-1">Post your first announcement above.</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className={`bg-white rounded-2xl border p-5 ${item.isPinned ? 'border-amber-200' : 'border-gray-100'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${item.isPinned ? 'bg-amber-50' : 'bg-[#1B2B5E]/5'}`}>
                    {item.isPinned ? <Pin size={15} className="text-amber-500" /> : <Megaphone size={15} className="text-[#1B2B5E]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-bold text-gray-900 text-sm">{item.title}</h3>
                      {item.isPinned && <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">PINNED</span>}
                    </div>
                    <p className="text-xs text-gray-400 mb-2">{item.authorName} · {formatDate(item.createdAt)} · {item.readBy?.length ?? 0} reads</p>
                    <p className="text-sm text-gray-600 line-clamp-2">{item.body}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => handlePin(item.id!, !item.isPinned)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${item.isPinned ? 'text-amber-500 bg-amber-50 hover:bg-amber-100' : 'text-gray-400 hover:bg-gray-100'}`}>
                    <Pin size={14} />
                  </button>
                  <button onClick={() => handleDelete(item.id!)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} onPosted={load} />}
    </div>
  );
}
