import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase SDK
const app = initializeApp(firebaseConfig);

// Export Firestore with long polling to ensure stability in all environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
});

export const storage = getStorage(app);

// Helper to validate ISO 8601 date string
export const isValidDateString = (dateStr: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.*Z?$/;
  return typeof dateStr === 'string' && regex.test(dateStr);
};

// Current Date in ISO 8601 format
export const getCurrentISODate = () => new Date().toISOString();
