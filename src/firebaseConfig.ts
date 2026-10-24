import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

/**
 * Firebase Configuration for CampusConnect
 * Configured with placeholders and project values
 */
export const firebaseConfig = {
  apiKey: "AIzaSyBEZJZd-2u38pt7lsM9xVawYYzE4ZCTgy8",
  authDomain: "campus-connect-d3967.firebaseapp.com",
  projectId: "campus-connect-d3967",
  storageBucket: "campus-connect-d3967.firebasestorage.app",
  messagingSenderId: "164227061116",
  appId: "1:164227061116:web:ba97babf92c0e7327f80f9"
};

// Initialize Firebase App singleton safely
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
