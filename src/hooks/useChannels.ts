'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { Channel } from '@/lib/types';

export function useChannels(uid: string | null) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    try {
      const q = query(
        collection(db, 'channels'),
        where('members', 'array-contains', uid),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const chans = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
          })) as Channel[];

          setChannels(chans);
          setLoading(false);
        },
        err => {
          console.error('Error fetching channels:', err);
          setError(err.message);
          setLoading(false);
        }
      );

      return unsubscribe;
    } catch (err: any) {
      setError(err.message || 'Failed to fetch channels');
      setLoading(false);
    }
  }, [uid]);

  return { channels, loading, error };
}
