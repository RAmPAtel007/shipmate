import {
  collection, doc, addDoc, getDocs, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp,
  arrayUnion, arrayRemove, setDoc, getDoc, startAfter,
  increment, deleteField,
  type Unsubscribe, type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { storageService } from './storageService';
import { isLongText } from '@/lib/utils/formatters';
import type { Channel, Message, MessageAttachment } from '@/lib/types';

const CHANNELS = 'channels';
const MESSAGES = 'messages';
const MESSAGES_PAGE_SIZE = 50;
const CHANNEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ── Module-level channel cache ────────────────────────────────────────────────
// Avoids repeated full-collection scans across re-renders and page loads.
let _channelCache: { data: Channel[]; ts: number } | null = null;

function mapMessage(id: string, data: DocumentData): Message {
  return { id, ...data } as Message;
}

function mapChannel(id: string, data: DocumentData): Channel {
  return { id, ...data } as Channel;
}

export const chatService = {

  // ── Channels ─────────────────────────────────────────────────────────────

  /** One-shot fetch with 5-min TTL cache. */
  async getChannels(): Promise<Channel[]> {
    if (_channelCache && Date.now() - _channelCache.ts < CHANNEL_CACHE_TTL) {
      return _channelCache.data;
    }
    const snap = await getDocs(collection(db, CHANNELS));
    const data = snap.docs.map(d => mapChannel(d.id, d.data()));
    _channelCache = { data, ts: Date.now() };
    return data;
  },

  /**
   * Real-time subscription to all channels.
   * Automatically keeps the module-level cache fresh — call this on the chat
   * page instead of getChannels() so the list stays in sync without polling.
   */
  subscribeToChannels(callback: (channels: Channel[]) => void): Unsubscribe {
    return onSnapshot(
      collection(db, CHANNELS),
      snap => {
        const channels = snap.docs.map(d => mapChannel(d.id, d.data()));
        _channelCache = { data: channels, ts: Date.now() };
        callback(channels);
      },
      err => console.error('[chatService] subscribeToChannels error:', err.code, err.message)
    );
  },

  /**
   * Fetch a single channel by ID.
   * Checks the cache first, then falls back to a single-doc getDoc() — much
   * cheaper than scanning the whole collection for a DM fallback.
   */
  async getChannelById(channelId: string): Promise<Channel | null> {
    if (_channelCache) {
      const hit = _channelCache.data.find(c => c.id === channelId);
      if (hit) return hit;
    }
    const snap = await getDoc(doc(db, CHANNELS, channelId));
    return snap.exists() ? mapChannel(snap.id, snap.data()) : null;
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
  // Uses single-field where only (no orderBy) to avoid composite-index requirement.
  // Firestore auto-creates single-field indexes; composite indexes need manual deployment.
  // Sorting is done client-side so the listener works even before indexes are deployed.

  subscribeToChannel(
    channelId: string,
    callback: (messages: Message[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, MESSAGES),
      where('channelId', '==', channelId),
    );

    return onSnapshot(q,
      snap => {
        const messages = snap.docs
          .map(d => mapMessage(d.id, d.data()))
          .filter(m => !m.isDeleted)
          .sort((a, b) => {
            const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
            const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
            return ta - tb; // oldest → newest
          })
          .slice(-MESSAGES_PAGE_SIZE); // keep last N
        callback(messages);
      },
      err => {
        console.error('[chatService] subscribeToChannel error:', err.code, err.message);
      }
    );
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

    // Non-critical metadata update — fire and forget
    updateDoc(doc(db, CHANNELS, channelId), {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: text.substring(0, 80),
      lastMessageSenderId: data.senderId,
    }).catch(() => {});

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
  // Accepts currentReactions from React state to avoid an extra Firestore read.

  async addReaction(
    messageId: string,
    emoji: string,
    userId: string,
    currentReactions: Record<string, { count: number; userIds: string[]; emoji: string }> = {}
  ): Promise<void> {
    const existing = currentReactions[emoji];

    if (existing?.userIds?.includes(userId)) {
      await chatService.removeReaction(messageId, emoji, userId, currentReactions);
      return;
    }

    await updateDoc(doc(db, MESSAGES, messageId), {
      [`reactions.${emoji}.count`]: increment(1),
      [`reactions.${emoji}.userIds`]: arrayUnion(userId),
      [`reactions.${emoji}.emoji`]: emoji,
    });
  },

  async removeReaction(
    messageId: string,
    emoji: string,
    userId: string,
    currentReactions: Record<string, { count: number; userIds: string[]; emoji: string }> = {}
  ): Promise<void> {
    const existing = currentReactions[emoji];
    if (!existing) return;

    const newCount = (existing.count ?? 1) - 1;
    if (newCount <= 0) {
      await updateDoc(doc(db, MESSAGES, messageId), {
        [`reactions.${emoji}`]: deleteField(),
      });
    } else {
      await updateDoc(doc(db, MESSAGES, messageId), {
        [`reactions.${emoji}.count`]: increment(-1),
        [`reactions.${emoji}.userIds`]: arrayRemove(userId),
      });
    }
  },

  // ── DM channels ──────────────────────────────────────────────────────────

  async getOrCreateDM(
    userId1: string,
    userName1: string,
    userId2: string,
    userName2: string,
  ): Promise<string> {
    const sorted = [userId1, userId2].sort();
    const dmId = `dm_${sorted[0]}_${sorted[1]}`;
    const channelRef = doc(db, CHANNELS, dmId);
    const snap = await getDoc(channelRef);

    if (!snap.exists()) {
      await setDoc(channelRef, {
        name: dmId,
        type: 'dm',
        members: sorted,
        participantNames: { [userId1]: userName1, [userId2]: userName2 },
        createdBy: userId1,
        isArchived: false,
        createdAt: serverTimestamp(),
      });
    } else {
      updateDoc(channelRef, {
        [`participantNames.${userId1}`]: userName1,
        [`participantNames.${userId2}`]: userName2,
      }).catch(() => {});
    }

    return dmId;
  },

  // ── Search ────────────────────────────────────────────────────────────────

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
