'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Message } from '@/lib/types';

export function useMessages(channelId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) {
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'messages'),
        where('channelId', '==', channelId),
        where('isDeleted', '==', false),
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const msgs = snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
            } as Message))
            .reverse();

          setMessages(msgs);
          setLoading(false);
        },
        err => {
          console.error('Error fetching messages:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      return unsubscribe;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch messages');
      setLoading(false);
    }
  }, [channelId]);

  return { messages, loading, error };
}
