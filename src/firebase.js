import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyD4nIQZrue55t481khlX-Nc2eOskB6eCr8",
  authDomain: "license-checker-2025.firebaseapp.com",
  projectId: "license-checker-2025",
  storageBucket: "license-checker-2025.firebasestorage.app",
  messagingSenderId: "917304812055",
  appId: "1:917304812055:web:e6010ee14fdc128f157252",
  measurementId: "G-QQNS9SLVRE"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);