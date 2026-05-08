import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Channel, ChannelType, Department } from '@/lib/types';

export async function createChannel(
  name: string,
  type: ChannelType,
  createdBy: string,
  members: string[] = [],
  description?: string,
  departmentId?: Department
): Promise<Channel> {
  const channelData = {
    name,
    type,
    createdBy,
    members: [...members, createdBy],
    description: description || '',
    departmentId,
    isArchived: false,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'channels'), channelData);

  return {
    id: docRef.id,
    ...channelData,
    createdAt: Timestamp.now(),
  } as Channel;
}

export async function fetchChannels(uid: string): Promise<Channel[]> {
  const q = query(
    collection(db, 'channels'),
    where('members', 'array-contains', uid),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Channel[];
}

export async function fetchPublicChannels(): Promise<Channel[]> {
  const q = query(
    collection(db, 'channels'),
    where('type', '==', 'public'),
    where('isArchived', '==', false),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Channel[];
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const snapshot = await getDocs(
    query(collection(db, 'channels'), where('id', '==', channelId))
  );

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return {
    id: doc.id,
    ...doc.data(),
  } as Channel;
}

export async function updateChannel(
  channelId: string,
  updates: Partial<Channel>
): Promise<void> {
  await updateDoc(doc(db, 'channels', channelId), updates);
}

export async function addMemberToChannel(
  channelId: string,
  uid: string
): Promise<void> {
  const channelRef = doc(db, 'channels', channelId);
  const snap = await getDocs(
    query(collection(db, 'channels'), where('id', '==', channelId))
  );

  if (snap.empty) throw new Error('Channel not found');

  const channel = snap.docs[0].data() as Channel;

  if (!channel.members.includes(uid)) {
    await updateDoc(snap.docs[0].ref, {
      members: [...channel.members, uid],
    });
  }
}

export async function removeMemberFromChannel(
  channelId: string,
  uid: string
): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'channels'), where('id', '==', channelId))
  );

  if (snap.empty) throw new Error('Channel not found');

  const channel = snap.docs[0].data() as Channel;

  await updateDoc(snap.docs[0].ref, {
    members: channel.members.filter(id => id !== uid),
  });
}

export async function archiveChannel(channelId: string): Promise<void> {
  const snap = await getDocs(
    query(collection(db, 'channels'), where('id', '==', channelId))
  );

  if (snap.empty) throw new Error('Channel not found');

  await updateDoc(snap.docs[0].ref, {
    isArchived: true,
  });
}
