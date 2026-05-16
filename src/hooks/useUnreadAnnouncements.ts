import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the number of announcements the current user has not yet read.
 *
 * Strategy (mirrors useUnreadCounts):
 * - Real-time subscription to the most recent 30 announcements.
 * - Checks both the Firestore `readBy` array AND localStorage
 *   (employees may lack Firestore update permission, so reads are stored locally).
 * - Returns a simple integer count — enough to drive dot/badge indicators.
 */
export function useUnreadAnnouncements(): number {
  const { currentUser } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!currentUser) {
      setCount(0);
      return;
    }

    const uid = currentUser.uid;
    const q = query(
      collection(db, 'announcements'),
      orderBy('createdAt', 'desc'),
      limit(30),
    );

    const unsub = onSnapshot(
      q,
      snap => {
        const unread = snap.docs.filter(d => {
          const readBy: string[] = d.data().readBy ?? [];
          if (readBy.includes(uid)) return false;
          // Fall back to localStorage for employees who can't write readBy
          if (typeof window !== 'undefined') {
            if (localStorage.getItem(`read_ann_${uid}_${d.id}`)) return false;
          }
          return true;
        }).length;
        setCount(unread);
      },
      () => setCount(0), // permission denied — silently ignore
    );

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  return count;
}
