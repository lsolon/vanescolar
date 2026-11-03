/**
 * ============================================================================
 * FIREBASE CLIENT INITIALIZATION (firebase.ts)
 * Configuração do SDK cliente para Firebase Auth (Google e E-mail/Senha)
 * ============================================================================
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyMockKeyForDevelopmentOnly12345",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "vanescolar-app.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "vanescolar-app",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "vanescolar-app.appspot.com",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: env.VITE_FIREBASE_APP_ID || "1:123:web:abc"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
