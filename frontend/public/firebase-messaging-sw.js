/* eslint-disable */
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey:            "AIzaSyCoSJhp-mH_4fb1X9AC4mzCyEKYOtsz8Fo",
  authDomain:        "lightproject-a629d-2195c.firebaseapp.com",
  projectId:         "lightproject-a629d-2195c",
  storageBucket:     "lightproject-a629d-2195c.firebasestorage.app",
  messagingSenderId: "583831377285",
  appId:             "1:583831377285:web:79fd22a88381559c64a0ec",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Notification en arrière-plan reçue:", payload);
  const { title, body } = payload.notification || {};
  const notifTitle = title || "LightProject";
  const notifBody  = body  || "Vous avez une nouvelle notification.";

  self.registration.showNotification(notifTitle, {
    body:    notifBody,
    icon:    "/logo192.png",
    badge:   "/logo192.png",
    vibrate: [200, 100, 200],
    data:    payload.data || {},
    actions: [
      { action: "open",    title: "Ouvrir" },
      { action: "dismiss", title: "Ignorer" },
    ],
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("localhost:3000") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("http://localhost:3000");
      }
    })
  );
});