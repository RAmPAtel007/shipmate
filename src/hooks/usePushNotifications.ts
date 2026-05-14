'use client';

import { useEffect } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getMessagingInstance } from '@/lib/firebase/config';
import { db } from '@/lib/firebase/config';
import toast from 'react-hot-toast';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

/**
 * Call this hook once inside the app shell (authenticated layout).
 * It requests push permission, registers the FCM token on the user's
 * Firestore doc, and shows a toast for foreground messages.
 */
export function usePushNotifications(userId?: string) {
  useEffect(() => {
    if (!userId || !VAPID_KEY) return;
    if (typeof window === 'undefined') return;

    let unsubscribe: (() => void) | undefined;

    async function init() {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      try {
        // Register service worker
        const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        // Get FCM token
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: sw,
        });

        if (token && userId) {
          // Save token to Firestore so server can send targeted push
          await updateDoc(doc(db, 'users', userId), { fcmToken: token });
        }

        // Handle foreground messages — show as toast
        unsubscribe = onMessage(messaging, payload => {
          const title = payload.notification?.title ?? 'Shipmate';
          const body  = payload.notification?.body  ?? '';
          toast(
            `🔔 ${title}${body ? ` — ${body}` : ''}`,
            { duration: 5000, position: 'top-right' }
          );
        });
      } catch (err) {
        // Silently fail — user may have denied permission
        console.warn('[FCM] init failed:', err);
      }
    }

    init();
    return () => { unsubscribe?.(); };
  }, [userId]);
}
