'use client';

import { useEffect, useState, useCallback } from 'react';
import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { getMessagingInstance } from '@/lib/firebase/config';
import { db } from '@/lib/firebase/config';
import toast from 'react-hot-toast';

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export type NotifPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Manages push notification permission and FCM token registration.
 *
 * Returns:
 *  - permission: current Notification.permission state
 *  - requestPermission(): call on a user gesture (button tap) to ask for permission
 */
export function usePushNotifications(userId?: string) {
  const [permission, setPermission] = useState<NotifPermission>('default');

  // Read current permission state on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }
    setPermission(Notification.permission as NotifPermission);
  }, []);

  // Once permission is granted + userId available, register FCM token
  useEffect(() => {
    if (!userId || permission !== 'granted') return;
    if (typeof window === 'undefined') return;
    if (!VAPID_KEY) return;

    let unsubscribe: (() => void) | undefined;

    async function registerToken() {
      const messaging = await getMessagingInstance();
      if (!messaging) return;

      try {
        const sw = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: sw,
        });

        if (token && userId) {
          await updateDoc(doc(db, 'users', userId), { fcmToken: token });
        }

        // Handle foreground messages as toasts
        unsubscribe = onMessage(messaging, payload => {
          const title = payload.notification?.title ?? 'Shipcube HR & Administration';
          const body  = payload.notification?.body  ?? '';
          toast(`🔔 ${title}${body ? ` — ${body}` : ''}`, {
            duration: 5000,
            position: 'top-right',
          });
        });
      } catch (err) {
        console.warn('[FCM] Token registration failed:', err);
      }
    }

    registerToken();
    return () => { unsubscribe?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, permission]);

  /**
   * Call this on a user gesture (button tap).
   * Requests browser notification permission then registers the FCM token.
   */
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) {
      setPermission('unsupported');
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result as NotifPermission);

      if (result === 'granted') {
        toast.success('Notifications enabled!', { duration: 3000 });
      } else if (result === 'denied') {
        toast.error('Notifications blocked. Enable them in your browser/phone settings.', { duration: 5000 });
      }
    } catch (err) {
      console.warn('[FCM] Permission request failed:', err);
    }
  }, []);

  return { permission, requestPermission };
}
