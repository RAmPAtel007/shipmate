import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Announcement, AnnouncementRead } from '@/lib/types';

export async function createAnnouncement(
  title: string,
  body: string,
  authorId: string,
  authorName: string,
  authorPhotoURL: string | null | undefined
): Promise<Announcement> {
  const announcementData = {
    title,
    body,
    authorId,
    authorName,
    authorPhotoURL: authorPhotoURL || null,
    isPinned: false,
    readBy: [],
    readCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(
    collection(db, 'announcements'),
    announcementData
  );

  return {
    id: docRef.id,
    ...announcementData,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } as Announcement;
}

export async function fetchAnnouncements(pageSize: number = 50): Promise<Announcement[]> {
  const constraints: QueryConstraint[] = [
    orderBy('isPinned', 'desc'),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];

  const q = query(collection(db, 'announcements'), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Announcement[];
}

export async function updateAnnouncement(
  announcementId: string,
  updates: Partial<Announcement>
): Promise<void> {
  await updateDoc(doc(db, 'announcements', announcementId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function pinAnnouncement(
  announcementId: string
): Promise<void> {
  await updateDoc(doc(db, 'announcements', announcementId), {
    isPinned: true,
    updatedAt: serverTimestamp(),
  });
}

export async function unpinAnnouncement(
  announcementId: string
): Promise<void> {
  await updateDoc(doc(db, 'announcements', announcementId), {
    isPinned: false,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteAnnouncement(
  announcementId: string
): Promise<void> {
  await deleteDoc(doc(db, 'announcements', announcementId));
}

export async function markAnnouncementAsRead(
  announcementId: string,
  userId: string,
  userName: string
): Promise<void> {
  const readId = `${userId}_${announcementId}`;

  await addDoc(collection(db, 'announcementReads'), {
    userId,
    announcementId,
    readAt: serverTimestamp(),
  });

  const announcementRef = doc(db, 'announcements', announcementId);
  const snap = await getDocs(
    query(collection(db, 'announcements'), where('__name__', '==', announcementId))
  );

  if (!snap.empty) {
    const announcement = snap.docs[0].data() as Announcement;

    if (!announcement.readBy.includes(userId)) {
      await updateDoc(snap.docs[0].ref, {
        readBy: [...announcement.readBy, userId],
        readCount: announcement.readCount + 1,
      });
    }
  }
}
