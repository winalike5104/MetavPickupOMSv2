// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
  apiKey: "AIzaSyA0z0xkKKuZO-A8GNRNCSwa1z_2vxJ2gdc",
  authDomain: "pickup-system-prod.firebaseapp.com",
  projectId: "pickup-system-prod",
  databaseURL: "https://pickup-system-prod-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "pickup-system-prod.firebasestorage.app",
  messagingSenderId: "885181520250",
  appId: "1:885181520250:web:b130f3130f6273ddb69ec3"
});

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
