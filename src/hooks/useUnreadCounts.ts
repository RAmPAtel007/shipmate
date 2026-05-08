import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot,
  orderBy, limit, Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCounts {
  total: number;
  byChannel: Record<string, number>;
}

/**
 * Tracks unread message counts across all channels the current user belongs to.
 *
 * Strategy (cost-conscious for 20 users):
 * - We store `lastReadAt` per user per channel in localStorage.
 * - We query the last 1 message per channel and compare createdAt vs lastReadAt.
 * - This gives a lightweight "has unread" indicator rather than an exact count.
 */
export function useUnreadCounts(): UnreadCounts {
  const { currentUser } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, byChannel: {} });
  const unsubs = useRef<Unsubscribe[]>([]);

  useEffect(() => {
    if (!currentUser) {
      setCounts({ total: 0, byChannel: {} });
      return;
    }

    // Clean up previous subscriptions
    unsubs.current.forEach(u => u());
    unsubs.current = [];

    // Subscribe to channels this user is in
    const channelsQ = query(
      collection(db, 'channels'),
      where('members', 'array-contains', currentUser.uid),
      where('isArchived', '==', false)
    );

    const unsubChannels = onSnapshot(channelsQ, snapshot => {
      // Clean up old message listeners
      unsubs.current.slice(1).forEach(u => u());
      unsubs.current = [unsubChannels];

      const newCounts: Record<string, number> = {};

      snapshot.docs.forEach(channelDoc => {
        const channelId = channelDoc.id;
        const lastReadKey = `lastRead_${currentUser.uid}_${channelId}`;
        const lastReadAt = localStorage.getItem(lastReadKey);

        // Subscribe to new messages in this channel
        let msgQuery = query(
          collection(db, 'messages'),
          where('channelId', '==', channelId),
          where('isDeleted', '==', false),
          orderBy('createdAt', 'desc'),
          limit(20)
        );

        const unsubMsg = onSnapshot(msgQuery, msgSnap => {
          let unread = 0;

          if (!lastReadAt) {
            // Never read — count messages not from self
            unread = msgSnap.docs.filter(
              m => m.data().senderId !== currentUser.uid
            ).length;
          } else {
            const lastReadTime = new Date(lastReadAt).getTime();
            unread = msgSnap.docs.filter(m => {
              const data = m.data();
              if (data.senderId === currentUser.uid) return false;
              const msgTime = data.createdAt?.toMillis?.() ?? 0;
              return msgTime > lastReadTime;
            }).length;
          }

          newCounts[channelId] = unread;

          const total = Object.values(newCounts).reduce((a, b) => a + b, 0);
          setCounts({ total, byChannel: { ...newCounts } });
        });

        unsubs.current.push(unsubMsg);
      });
    });

    unsubs.current = [unsubChannels];

    return () => {
      unsubs.current.forEach(u => u());
      unsubs.current = [];
    };
  }, [currentUser?.uid]);

  return counts;
}

/**
 * Call this when the user opens a channel to mark it as read.
 */
export function markChannelRead(userId: string, channelId: string): void {
  const key = `lastRead_${userId}_${channelId}`;
  localStorage.setItem(key, new Date().toISOString());
}
