import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  getDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Message, MessageAttachment } from '@/lib/types';

export async function fetchMessages(
  channelId: string,
  pageSize: number = 50
): Promise<Message[]> {
  const constraints: QueryConstraint[] = [
    where('channelId', '==', channelId),
    where('isDeleted', '==', false),
    orderBy('createdAt', 'desc'),
    limit(pageSize),
  ];

  const q = query(collection(db, 'messages'), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Message[];
}

export async function sendMessage(
  channelId: string,
  senderId: string,
  senderName: string,
  senderPhotoURL: string | null | undefined,
  text: string,
  attachments: MessageAttachment[] = [],
  messageType: 'text' | 'image' | 'file' | 'code' | 'system' = 'text',
  mentions: string[] = []
): Promise<Message> {
  const isLongText = text.length > 4000;

  const messageData = {
    channelId,
    senderId,
    senderName,
    senderPhotoURL: senderPhotoURL || null,
    text: isLongText ? text.substring(0, 500) : text,
    textPreview: isLongText ? text.substring(0, 300) + '...' : undefined,
    fullTextStoragePath: isLongText
      ? `long-messages/${channelId}/${Date.now()}/content.md`
      : undefined,
    isLongText,
    messageType,
    attachments,
    mentions,
    reactions: {},
    isEdited: false,
    isDeleted: false,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'messages'), messageData);

  return {
    id: docRef.id,
    ...messageData,
    createdAt: Timestamp.now(),
  } as Message;
}

export async function editMessage(
  messageId: string,
  newText: string
): Promise<void> {
  await updateDoc(doc(db, 'messages', messageId), {
    text: newText,
    isEdited: true,
    editedAt: serverTimestamp(),
  });
}

export async function deleteMessage(messageId: string): Promise<void> {
  await updateDoc(doc(db, 'messages', messageId), {
    isDeleted: true,
    deletedAt: serverTimestamp(),
  });
}

export async function addReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'messages', messageId);
  const snap = await getDoc(messageRef);

  if (!snap.exists()) throw new Error('Message not found');

  const reactions = snap.data().reactions || {};
  const reaction = reactions[emoji] || {
    emoji,
    count: 0,
    userIds: [],
  };

  if (!reaction.userIds.includes(userId)) {
    reaction.userIds.push(userId);
    reaction.count = reaction.userIds.length;
  }

  reactions[emoji] = reaction;

  await updateDoc(messageRef, { reactions });
}

export async function removeReaction(
  messageId: string,
  emoji: string,
  userId: string
): Promise<void> {
  const messageRef = doc(db, 'messages', messageId);
  const snap = await getDoc(messageRef);

  if (!snap.exists()) throw new Error('Message not found');

  const reactions = snap.data().reactions || {};
  const reaction = reactions[emoji];

  if (reaction) {
    reaction.userIds = reaction.userIds.filter((id: string) => id !== userId);
    reaction.count = reaction.userIds.length;

    if (reaction.count === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = reaction;
    }

    await updateDoc(messageRef, { reactions });
  }
}
