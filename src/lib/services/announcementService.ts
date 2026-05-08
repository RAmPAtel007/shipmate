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
    const q = query(
      collection(db, 'announcements'),
      orderBy('isPinned', 'desc'),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
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
      where('isPinned', '==', true),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
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
    await updateDoc(doc(db, 'announcements', announcementId), {
      readBy: arrayUnion(userId),
    });
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
    return announcement.readBy?.includes(userId) ?? false;
  },
};
