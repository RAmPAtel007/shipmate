import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

interface UnreadCounts {
  total: number;
  byChannel: Record<string, number>;
}

/**
 * Tracks unread message indicators for all accessible channels.
 *
 * Strategy:
 * - Subscribe to the full channels collection (single-collection scan, no composite index).
 * - Each channel doc carries `lastMessageAt` and `lastMessageSenderId` (updated by sendMessage).
 * - Compare `lastMessageAt` vs localStorage `lastRead_<uid>_<channelId>`.
 * - Returns 1 (unread) or 0 (read) per channel — enough to show a dot indicator.
 * - Zero Firestore reads beyond the channels collection itself.
 */
export function useUnreadCounts(): UnreadCounts {
  const { currentUser } = useAuth();
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, byChannel: {} });

  useEffect(() => {
    if (!currentUser) {
      setCounts({ total: 0, byChannel: {} });
      return;
    }

    const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);

    const unsub = onSnapshot(
      collection(db, 'channels'),
      snap => {
        const byChannel: Record<string, number> = {};

        snap.docs.forEach(d => {
          const ch = d.data() as any;
          const channelId = d.id;

          // Filter to channels this user can access
          if (ch.isArchived) return;
          if (ch.type === 'dm' && !ch.members?.includes(currentUser.uid)) return;
          if (!isAdmin && ch.type === 'department' &&
              !ch.members?.includes(currentUser.uid) &&
              ch.departmentId !== currentUser.department) return;

          // No messages in this channel yet
          if (!ch.lastMessageAt) {
            byChannel[channelId] = 0;
            return;
          }

          // Message sent by current user — never unread for them
          if (ch.lastMessageSenderId === currentUser.uid) {
            byChannel[channelId] = 0;
            return;
          }

          // Compare lastMessageAt vs when user last read this channel
          const lastReadKey = `lastRead_${currentUser.uid}_${channelId}`;
          const lastReadStr = localStorage.getItem(lastReadKey);
          const lastReadTime = lastReadStr ? new Date(lastReadStr).getTime() : 0;
          const lastMsgTime  = ch.lastMessageAt?.toMillis?.() ?? 0;

          byChannel[channelId] = lastMsgTime > lastReadTime ? 1 : 0;
        });

        const total = Object.values(byChannel).reduce((a, b) => a + b, 0);
        setCounts({ total, byChannel });
      },
      err => console.error('[useUnreadCounts] error:', err.code, err.message)
    );

    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid]);

  return counts;
}

/**
 * Call when the user opens a channel — marks it as read.
 */
export function markChannelRead(userId: string, channelId: string): void {
  localStorage.setItem(`lastRead_${userId}_${channelId}`, new Date().toISOString());
}
