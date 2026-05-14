// Firebase Cloud Messaging Service Worker
// Handles push notifications when the app is in the background or closed.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Firebase config — these are public NEXT_PUBLIC_ values, safe to include here.
// Update these values if your Firebase project changes.
firebase.initializeApp({
  apiKey:            'AIzaSyCalrP_yTJxMZ5-zfRbFfbiTzq_0SzuZIk',
  authDomain:        'shipmate-30.firebaseapp.com',
  projectId:         'shipmate-30',
  storageBucket:     'shipmate-30.firebasestorage.app',
  messagingSenderId: '13715156531',
  appId:             '1:13715156531:web:251f3738bc44b7e2c0fd46',
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
