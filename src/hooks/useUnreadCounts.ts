import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCounts {
  total: number;
  byChannel: Record<string, number>;
}

/** Internal event fired whenever a channel is marked read in the same tab. */
const READ_EVENT = 'shipmate:channelRead';

/**
 * Tracks unread message indicators for all accessible channels.
 *
 * Strategy:
 * - Subscribe to the full channels collection (single-collection scan, no composite index).
 * - Each channel doc carries `lastMessageAt` and `lastMessageSenderId`.
 * - Compare `lastMessageAt` vs localStorage `lastRead_<uid>_<channelId>`.
 * - Recalculates immediately when `markChannelRead` is called (not just on next Firestore event).
 */
export function useUnreadCounts(): UnreadCounts {
  const { currentUser } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, byChannel: {} });

  // Hold the latest Firestore snapshot so we can re-derive counts without
  // waiting for the next network event when localStorage changes.
  const latestSnap = useRef<QuerySnapshot<DocumentData> | null>(null);

  const recalculate = useCallback((
    snap: QuerySnapshot<DocumentData>,
    uid: string,
    role: string,
    department: string,
  ) => {
    const isAdmin = ['super_admin', 'hr_admin'].includes(role);
    const byChannel: Record<string, number> = {};

    snap.docs.forEach(d => {
      const ch    = d.data() as any;
      const chId  = d.id;

      if (ch.isArchived) return;
      if (ch.type === 'dm' && !ch.members?.includes(uid)) return;
      if (!isAdmin && ch.type === 'department' &&
          !ch.members?.includes(uid) &&
          ch.departmentId !== department) return;

      if (!ch.lastMessageAt)                     { byChannel[chId] = 0; return; }
      if (ch.lastMessageSenderId === uid)         { byChannel[chId] = 0; return; }

      const lastReadKey  = `lastRead_${uid}_${chId}`;
      const lastReadStr  = localStorage.getItem(lastReadKey);
      const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : 0;
      const lastMsgTime  = ch.lastMessageAt?.toMillis?.() ?? 0;

      byChannel[chId] = lastMsgTime > lastReadTime ? 1 : 0;
    });

    const total = Object.values(byChannel).reduce((a, b) => a + b, 0);
    setCounts({ total, byChannel });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setCounts({ total: 0, byChannel: {} });
      return;
    }

    const { uid, role, department } = currentUser;

    // Firestore subscription — updates latestSnap and recalculates
    const unsub = onSnapshot(
      collection(db, 'channels'),
      snap => {
        latestSnap.current = snap;
        recalculate(snap, uid, role, department ?? '');
      },
      err => console.error('[useUnreadCounts]', err.code, err.message),
    );

    // Local event listener — recalculates immediately when markChannelRead fires
    const handleRead = () => {
      if (latestSnap.current) {
        recalculate(latestSnap.current, uid, role, department ?? '');
      }
    };
    window.addEventListener(READ_EVENT, handleRead);

    return () => {
      unsub();
      window.removeEventListener(READ_EVENT, handleRead);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  return counts;
}

/**
 * Call when the user opens a channel — marks it as read instantly.
 * Dispatches a local event so the badge clears without waiting for Firestore.
 */
export function markChannelRead(userId: string, channelId: string): void {
  localStorage.setItem(`lastRead_${userId}_${channelId}`, new Date().toISOString());
  window.dispatchEvent(new Event(READ_EVENT));
}
