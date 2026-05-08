import {
  collection, doc, addDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, setDoc, getDoc, startAfter,
  type Unsubscribe, type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { storageService } from './storageService';
import { isLongText } from '@/lib/utils/formatters';
import type { Channel, Message, MessageAttachment } from '@/lib/types';

const CHANNELS = 'channels';
const MESSAGES = 'messages';
const MESSAGES_PAGE_SIZE = 50;

function mapMessage(id: string, data: DocumentData): Message {
  return { id, ...data } as Message;
}

function mapChannel(id: string, data: DocumentData): Channel {
  return { id, ...data } as Channel;
}

export const chatService = {

  // ── Channels ─────────────────────────────────────────────────────────────

  async getChannels(): Promise<Channel[]> {
    const snap = await getDocs(collection(db, CHANNELS));
    return snap.docs.map(d => mapChannel(d.id, d.data()));
  },

  async getAccessibleChannels(userId: string, userDept: string, userRole: string): Promise<Channel[]> {
    const all = await chatService.getChannels();
    const isAdmin = ['super_admin', 'hr_admin'].includes(userRole);

    return all.filter(ch => {
      if (ch.isArchived) return false;
      if (ch.type === 'public') return true;
      if (isAdmin) return true;
      if (ch.members.includes(userId)) return true;
      if (ch.type === 'department' && ch.departmentId === userDept) return true;
      return false;
    });
  },

  // ── Messages — Real-time subscription ────────────────────────────────────

  subscribeToChannel(
    channelId: string,
    callback: (messages: Message[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, MESSAGES),
      where('channelId', '==', channelId),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc'),
      limit(MESSAGES_PAGE_SIZE)
    );

    return onSnapshot(q, snap => {
      const messages = snap.docs
        .map(d => mapMessage(d.id, d.data()))
        .reverse(); // Newest-last for display
      callback(messages);
    });
  },

  async loadMoreMessages(
    channelId: string,
    beforeDoc: QueryDocumentSnapshot
  ): Promise<Message[]> {
    const q = query(
      collection(db, MESSAGES),
      where('channelId', '==', channelId),
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc'),
      startAfter(beforeDoc),
      limit(MESSAGES_PAGE_SIZE)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapMessage(d.id, d.data())).reverse();
  },

  // ── Send Message ──────────────────────────────────────────────────────────

  async sendMessage(data: {
    channelId: string;
    senderId: string;
    senderName: string;
    senderPhotoURL: string | null;
    text: string;
    mentions?: string[];
    replyTo?: string;
    replyToPreview?: string;
    replyToSenderName?: string;
    attachments?: MessageAttachment[];
  }): Promise<string> {
    const { text, channelId } = data;

    let messageData: Omit<Message, 'id'>;

    if (isLongText(text)) {
      // Store full text in Cloud Storage, keep preview in Firestore
      const tempId = `temp_${Date.now()}`;
      const storagePath = await storageService.uploadLongMessage(channelId, tempId, text);

      messageData = {
        ...data,
        text: text.substring(0, 300) + '…',
        textPreview: text.substring(0, 300),
        fullTextStoragePath: storagePath,
        isLongText: true,
        messageType: 'text',
        attachments: data.attachments ?? [],
        mentions: data.mentions ?? [],
        reactions: {},
        isEdited: false,
        isDeleted: false,
        createdAt: serverTimestamp() as any,
      };
    } else {
      messageData = {
        ...data,
        isLongText: false,
        messageType: 'text',
        attachments: data.attachments ?? [],
        mentions: data.mentions ?? [],
        reactions: {},
        isEdited: false,
        isDeleted: false,
        createdAt: serverTimestamp() as any,
      };
    }

    const ref = await addDoc(collection(db, MESSAGES), messageData);

    // Update channel last message preview
    await updateDoc(doc(db, CHANNELS, channelId), {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: text.substring(0, 80),
      lastMessageSenderId: data.senderId,
    }).catch(() => {}); // Non-critical

    return ref.id;
  },

  // ── Soft delete ───────────────────────────────────────────────────────────

  async deleteMessage(messageId: string): Promise<void> {
    await updateDoc(doc(db, MESSAGES, messageId), {
      isDeleted: true,
      deletedAt: serverTimestamp(),
      text: 'This message was deleted.',
      attachments: [],
    });
  },

  // ── Reactions ────────────────────────────────────────────────────────────

  async addReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const snap = await getDoc(doc(db, MESSAGES, messageId));
    if (!snap.exists()) return;

    const reactions = snap.data().reactions ?? {};
    const existing = reactions[emoji];

    if (existing?.userIds?.includes(userId)) {
      // Toggle off
      await chatService.removeReaction(messageId, emoji, userId);
      return;
    }

    await updateDoc(doc(db, MESSAGES, messageId), {
      [`reactions.${emoji}.count`]: (existing?.count ?? 0) + 1,
      [`reactions.${emoji}.userIds`]: arrayUnion(userId),
      [`reactions.${emoji}.emoji`]: emoji,
    });
  },

  async removeReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const snap = await getDoc(doc(db, MESSAGES, messageId));
    if (!snap.exists()) return;
    const reactions = snap.data().reactions ?? {};
    const existing = reactions[emoji];
    if (!existing) return;

    const newCount = (existing.count ?? 1) - 1;
    if (newCount <= 0) {
      // Remove the emoji key entirely
      const update: Record<string, any> = {};
      update[`reactions.${emoji}`] = null; // Firestore deleteField equivalent via null
      // Actually use deleteField
      const { deleteField } = await import('firebase/firestore');
      await updateDoc(doc(db, MESSAGES, messageId), {
        [`reactions.${emoji}`]: deleteField(),
      });
    } else {
      await updateDoc(doc(db, MESSAGES, messageId), {
        [`reactions.${emoji}.count`]: newCount,
        [`reactions.${emoji}.userIds`]: arrayRemove(userId),
      });
    }
  },

  // ── DM channels ──────────────────────────────────────────────────────────

  async getOrCreateDM(userId1: string, userId2: string): Promise<string> {
    // Deterministic channel ID so we never create duplicates
    const sorted = [userId1, userId2].sort();
    const dmId = `dm_${sorted[0]}_${sorted[1]}`;
    const channelRef = doc(db, CHANNELS, dmId);
    const snap = await getDoc(channelRef);

    if (!snap.exists()) {
      await setDoc(channelRef, {
        name: dmId,
        type: 'dm',
        members: sorted,
        createdBy: userId1,
        isArchived: false,
        createdAt: serverTimestamp(),
      });
    }

    return dmId;
  },

  // ── Search ────────────────────────────────────────────────────────────────
  // Basic prefix search — upgrade to Algolia/Typesense in v2

  async searchMessages(searchTerm: string, channelId?: string): Promise<Message[]> {
    const constraints: any[] = [
      where('isDeleted', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20),
    ];
    if (channelId) constraints.unshift(where('channelId', '==', channelId));

    const q = query(collection(db, MESSAGES), ...constraints);
    const snap = await getDocs(q);
    const lower = searchTerm.toLowerCase();
    return snap.docs
      .map(d => mapMessage(d.id, d.data()))
      .filter(m => m.text.toLowerCase().includes(lower));
  },
};
