import { getToken, onMessage, isSupported } from 'firebase/messaging';
import { messaging, db } from './firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile } from './types';

// @ts-ignore
const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;

export const requestNotificationPermission = async (profile: UserProfile | null) => {
  if (!profile || !VAPID_KEY) return;

  try {
    const supported = await isSupported();
    if (!supported || typeof window === 'undefined' || !('Notification' in window)) {
      console.log('Notifications not supported in this browser.');
      return;
    }

    const permission = await window.Notification.requestPermission();
    if (permission === 'granted' && messaging) {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (token) {
        // Update user profile with FCM token
        await updateDoc(doc(db, 'users', profile.uid), {
          fcmToken: token
        });
        console.log('FCM Token updated:', token);
      }
    }
  } catch (err) {
    console.error('Error getting FCM token:', err);
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload);
      resolve(payload);
    });
  });
