// ── Firebase Messaging Service Worker ────────────────────────────────────────
// Handles background push notifications when the app is closed/backgrounded.
// NOTE: process.env is NOT available in service workers — values must be inlined.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            'AIzaSyCUOjutvn3PoI8koBQ0prMmipiQKu-BsfU',
  authDomain:        'gemini-enterprise-481717.firebaseapp.com',
  projectId:         'gemini-enterprise-481717',
  storageBucket:     'gemini-enterprise-481717.firebasestorage.app',
  messagingSenderId: '882322353660',
  appId:             '1:882322353660:web:f38291c861878c90fb1679',
});

const messaging = firebase.messaging();

// Background message handler — fires when app is NOT in foreground
messaging.onBackgroundMessage(payload => {
  const title = payload.notification?.title ?? payload.data?.title ?? 'Shipmate';
  const body  = payload.notification?.body  ?? payload.data?.body  ?? 'You have a new notification';
  const icon  = '/icons/icon-192.png';
  const badge = '/icons/icon-96.png';
  const url   = payload.data?.url ?? '/home';
  const tag   = payload.data?.tag ?? 'shipmate';

  self.registration.showNotification(title, {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    data: { url },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  });
});

// Notification click — open or focus the app on the right page
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/home';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus an existing tab if the app is already open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          if (client.navigate) client.navigate(url);
          return;
        }
      }
      // Otherwise open a new tab
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
