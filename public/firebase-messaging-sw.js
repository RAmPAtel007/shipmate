// Firebase Cloud Messaging Service Worker
// Handles push notifications when the app is in the background or closed.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase config — these are public NEXT_PUBLIC_ values, safe to include here.
// Update these values if your Firebase project changes.
firebase.initializeApp({
  apiKey:            self.FIREBASE_API_KEY            || 'YOUR_API_KEY',
  authDomain:        self.FIREBASE_AUTH_DOMAIN        || 'YOUR_AUTH_DOMAIN',
  projectId:         self.FIREBASE_PROJECT_ID         || 'YOUR_PROJECT_ID',
  storageBucket:     self.FIREBASE_STORAGE_BUCKET     || 'YOUR_STORAGE_BUCKET',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID|| 'YOUR_SENDER_ID',
  appId:             self.FIREBASE_APP_ID             || 'YOUR_APP_ID',
});

const messaging = firebase.messaging();

// Handle background push messages
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Background message:', payload);

  const title = payload.notification?.title ?? payload.data?.title ?? 'Shipmate';
  const body  = payload.notification?.body  ?? payload.data?.body  ?? 'You have a new notification';
  const icon  = payload.notification?.icon  ?? '/icon-192.png';

  self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icon-72.png',
    data: payload.data,
    vibrate: [200, 100, 200],
  });
});

// Handle notification click — open/focus the app
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});
