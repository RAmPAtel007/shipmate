'use client';

import { useState, useEffect } from 'react';
import {
  Bell, Pin, Plus, X, Megaphone,
  ChevronDown, ChevronUp, Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, Badge, EmptyState, Button } from '@/components/ui';
import { announcementService } from '@/lib/services/announcementService';
import { formatDate } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import type { Announcement } from '@/lib/types';
import toast from 'react-hot-toast';

// ── Announcement card ─────────────────────────────────────────────────────────

function AnnouncementCard({
  item,
  currentUserId,
  canAdmin,
  onPin,
  onDelete,
  onRead,
}: {
  item: Announcement;
  currentUserId: string;
  canAdmin: boolean;
  onPin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isRead = announcementService.hasUserRead(item, currentUserId);
  const bodyPreview = item.body.slice(0, 180);
  const isLong = item.body.length > 180;

  useEffect(() => {
    if (!isRead) {
      // Mark as read after 1s of being visible
      const t = setTimeout(() => onRead(item.id!), 1000);
      return () => clearTimeout(t);
    }
  }, [item.id, isRead, onRead]);

  return (
    <div
      className={cn(
        'bg-white rounded-2xl border p-4 transition-all',
        item.isPinned ? 'border-[#F5C518]/40 shadow-sm' : 'border-gray-100',
        !isRead && 'border-l-4 border-l-[#1B2B5E]'
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
          item.isPinned ? 'bg-amber-50' : 'bg-[#1B2B5E]/5'
        )}>
          {item.isPinned
            ? <Pin size={16} className="text-amber-500" />
            : <Bell size={16} className="text-[#1B2B5E]" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900 text-sm">{item.title}</h3>
                {item.isPinned && (
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                    PINNED
                  </span>
                )}
                {!isRead && (
                  <span className="w-2 h-2 bg-[#1B2B5E] rounded-full inline-block" />
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {item.authorName} · {formatDate(item.createdAt)}
              </p>
            </div>

            {canAdmin && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onPin(item.id!, !item.isPinned)}
                  className={cn(
                    'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
                    item.isPinned
                      ? 'text-amber-500 bg-amber-50 hover:bg-amber-100'
                      : 'text-gray-400 hover:bg-gray-100 hover:text-amber-500'
                  )}
                  title={item.isPinned ? 'Unpin' : 'Pin'}
                >
                  <Pin size={13} />
                </button>
                <button
                  onClick={() => onDelete(item.id!)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="Delete"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          <div className="mt-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {isLong && !expanded ? bodyPreview + '…' : item.body}
            </p>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-[#1B2B5E] font-semibold mt-1.5 hover:underline"
              >
                {expanded ? <><ChevronUp size={12} /> Show less</> : <><ChevronDown size={12} /> Read more</>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compose modal ─────────────────────────────────────────────────────────────

function ComposeModal({
  authorId,
  authorName,
  onClose,
  onPosted,
}: {
  authorId: string;
  authorName: string;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handlePost() {
    if (!title.trim() || !body.trim()) {
      toast.error('Title and body are required');
      return;
    }
    setSaving(true);
    try {
      await announcementService.createAnnouncement({
        title: title.trim(),
        body: body.trim(),
        authorId,
        authorName,
        isPinned: pinned,
      });
      toast.success('Announcement posted!');
      onPosted();
      onClose();
    } catch {
      toast.error('Failed to post announcement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-[#1B2B5E] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone size={16} className="text-[#F5C518]" />
            <h2 className="text-white font-bold text-sm">New Announcement</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Announcement title…"
              maxLength={120}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Message</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your announcement…"
              rows={5}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] resize-none"
            />
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              onClick={() => setPinned(!pinned)}
              className={cn(
                'w-9 h-5 rounded-full transition-colors flex items-center',
                pinned ? 'bg-amber-400' : 'bg-gray-200'
              )}
            >
              <div className={cn(
                'w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5',
                pinned ? 'translate-x-4' : 'translate-x-0'
              )} />
            </div>
            <span className="text-sm text-gray-700">Pin this announcement</span>
          </label>

          <div className="flex gap-2 pt-1">
            <Button variant="ghost" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" onClick={handlePost} loading={saving}>
              Post
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const { currentUser } = useAuth();
  const { can } = useRole();

  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await announcementService.getAnnouncements(50);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handlePin(id: string, pinned: boolean) {
    await announcementService.togglePin(id, pinned);
    setItems(prev => prev.map(a => a.id === id ? { ...a, isPinned: pinned } : a));
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    await announcementService.deleteAnnouncement(id);
    setItems(prev => prev.filter(a => a.id !== id));
    toast.success('Deleted');
  }

  function handleRead(id: string) {
    if (!currentUser) return;
    // markAsRead saves to localStorage immediately and fires Firestore in background.
    // UI update is synchronous — no await needed.
    announcementService.markAsRead(id, currentUser.uid);
    setItems(prev =>
      prev.map(a =>
        a.id === id
          ? { ...a, readBy: [...(a.readBy ?? []), currentUser.uid] }
          : a
      )
    );
  }

  if (!currentUser) return null;

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto pb-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Announcements</h1>
            {!loading && (() => {
              const unread = items.filter(a => !announcementService.hasUserRead(a, currentUser.uid)).length;
              return unread > 0 ? (
                <span className="min-w-[20px] h-5 bg-[#1B2B5E] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1.5">
                  {unread}
                </span>
              ) : null;
            })()}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">{items.length} total</p>
        </div>
        {can.postAnnouncements && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCompose(true)}
            className="flex items-center gap-1.5"
          >
            <Plus size={14} />
            Post
          </Button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 space-y-2">
              <div className="h-4 w-48 rounded shimmer" />
              <div className="h-3 w-full rounded shimmer" />
              <div className="h-3 w-3/4 rounded shimmer" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={24} />}
          title="No announcements yet"
          description={can.postAnnouncements ? 'Post your first announcement above.' : 'Check back later.'}
          action={can.postAnnouncements ? { label: 'Post Announcement', onClick: () => setShowCompose(true) } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <AnnouncementCard
              key={item.id}
              item={item}
              currentUserId={currentUser.uid}
              canAdmin={can.postAnnouncements || can.pinAnnouncements}
              onPin={handlePin}
              onDelete={handleDelete}
              onRead={handleRead}
            />
          ))}
        </div>
      )}

      {showCompose && currentUser && (
        <ComposeModal
          authorId={currentUser.uid}
          authorName={currentUser.name}
          onClose={() => setShowCompose(false)}
          onPosted={load}
        />
      )}
    </div>
  );
}
