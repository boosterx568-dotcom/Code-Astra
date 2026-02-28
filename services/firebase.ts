import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAt6jSkziZ9vDO6iB8xhVXPlGrbOW78kyM",
  authDomain: "codastra-bb11c.firebaseapp.com",
  projectId: "codastra-bb11c",
  storageBucket: "codastra-bb11c.firebasestorage.app",
  messagingSenderId: "823438306071",
  appId: "1:823438306071:web:2c3ec7ef6a3b5d9573a552",
  measurementId: "G-T2470Y14T9"
};

// Initialize the Firebase App instance
const app = initializeApp(firebaseConfig);

// Initialize Firebase services and export them
// Calling getAuth and getFirestore with the app instance is essential to ensure registration
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
