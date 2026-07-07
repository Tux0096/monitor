import type { PushFirebaseWebConfig } from "./config.js";

export function buildMessagingServiceWorker(config: PushFirebaseWebConfig): string {
  return `importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  })});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload.notification?.title || 'Фуджи · Мониторинг';
  const body = payload.notification?.body || 'Новое уведомление';
  const link = payload.fcmOptions?.link || payload.data?.link || '/dashboard';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/monitor-icon.svg',
    badge: '/icons/monitor-icon.svg',
    data: { link },
    tag: payload.data?.tag || 'monitor-alert',
  });
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const link = event.notification.data?.link || '/dashboard';
  event.waitUntil(clients.openWindow(link));
});
`;
}
