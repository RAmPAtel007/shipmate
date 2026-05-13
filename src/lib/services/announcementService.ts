import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy, where, limit,
  serverTimestamp, arrayUnion, arrayRemove, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Announcement, AnnouncementRead } from '@/lib/types';

export const announcementService = {

  // ── Create announcement ──────────────────────────────────────────────────

  async createAnnouncement(data: {
    title: string;
    body: string;
    authorId: string;
    authorName: string;
    authorPhotoURL?: string;
    isPinned?: boolean;
    targetDepartments?: string[];
  }): Promise<string> {
    const ref = await addDoc(collection(db, 'announcements'), {
      ...data,
      isPinned: data.isPinned ?? false,
      targetDepartments: data.targetDepartments ?? [],
      readBy: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  },

  // ── Get announcements ────────────────────────────────────────────────────

  async getAnnouncements(limitCount = 20): Promise<Announcement[]> {
    // Order by createdAt only (single-field auto-index). Sort pinned first client-side.
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
    // Pinned items float to top
    return items.sort((a, b) => {
      if (a.isPinned === b.isPinned) return 0;
      return a.isPinned ? -1 : 1;
    });
  },

  async getLatestAnnouncements(limitCount = 5): Promise<Announcement[]> {
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
  },

  async getPinnedAnnouncements(): Promise<Announcement[]> {
    const q = query(
      collection(db, 'announcements'),
      where('isPinned', '==', true)
    );
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
    return items.sort((a, b) => {
      const ta = a.createdAt as any;
      const tb = b.createdAt as any;
      const da = ta?.toDate?.() ?? new Date(0);
      const db2 = tb?.toDate?.() ?? new Date(0);
      return db2.getTime() - da.getTime();
    });
  },

  // ── Update / delete ──────────────────────────────────────────────────────

  async updateAnnouncement(id: string, updates: Partial<Announcement>): Promise<void> {
    await updateDoc(doc(db, 'announcements', id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteAnnouncement(id: string): Promise<void> {
    await deleteDoc(doc(db, 'announcements', id));
  },

  async togglePin(id: string, pinned: boolean): Promise<void> {
    await updateDoc(doc(db, 'announcements', id), {
      isPinned: pinned,
      updatedAt: serverTimestamp(),
    });
  },

  // ── Read receipts ────────────────────────────────────────────────────────

  async markAsRead(announcementId: string, userId: string): Promise<void> {
    // Always persist locally so read state survives even if Firestore update is blocked.
    if (typeof window !== 'undefined') {
      localStorage.setItem(`read_ann_${userId}_${announcementId}`, '1');
    }
    // Also try to update Firestore readBy array — works for admins/managers.
    // Employees may not have update permission yet; the catch is intentional.
    updateDoc(doc(db, 'announcements', announcementId), {
      readBy: arrayUnion(userId),
    }).catch(() => {/* employee permission denied — local state already saved above */});
  },

  async getUnreadCount(userId: string): Promise<number> {
    const q = query(
      collection(db, 'announcements'),
      where('readBy', 'array-contains', userId)
    );
    const readSnap = await getDocs(q);
    const totalSnap = await getDocs(collection(db, 'announcements'));
    return totalSnap.size - readSnap.size;
  },

  hasUserRead(announcement: Announcement, userId: string): boolean {
    // Check Firestore readBy array first
    if (announcement.readBy?.includes(userId)) return true;
    // Fall back to localStorage (used when employee lacks Firestore update permission)
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem(`read_ann_${userId}_${announcement.id}`);
    }
    return false;
  },
};
