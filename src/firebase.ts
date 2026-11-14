/**
 * Firebase Client Initialization
 * Project: holistik-dcd95
 */
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getAnalytics, isSupported } from 'firebase/analytics';

// Konfigurasi resmi Firebase proyek holistik-dcd95
export const firebaseConfig = {
  apiKey: "AIzaSyBh11C7vle9u8GX6OzC8roeWFi9SJYoLEs",
  authDomain: "holistik-dcd95.firebaseapp.com",
  databaseURL: "https://holistik-dcd95-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "holistik-dcd95",
  storageBucket: "holistik-dcd95.firebasestorage.app",
  messagingSenderId: "316765375432",
  appId: "1:316765375432:web:704f0dcd95178d80440efd",
  measurementId: "G-6GF7FLBBPC"
};

// Singleton Firebase App instance
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firebase Authentication
export const auth = getAuth(app);

// Cloud Firestore Database
export const db = getFirestore(app);

// Firebase Realtime Database
let realtimeDb: ReturnType<typeof getDatabase> | null = null;
try {
  realtimeDb = getDatabase(app);
} catch (err) {
  console.warn('Firebase Realtime Database initialization notice:', err);
}
export const rtdb = realtimeDb;

// Firebase Analytics (safe initialization for browser / iframe environments)
export let analytics: any = null;
if (typeof window !== 'undefined') {
  isSupported().then((supported) => {
    if (supported) {
      analytics = getAnalytics(app);
    }
  }).catch(() => {
    // Ignore analytics unsupported warnings in restricted environments
  });
}

export default app;
