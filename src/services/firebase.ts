/**
 * ============================================================================
 * FIREBASE CLIENT INITIALIZATION (firebase.ts)
 * Configuração do SDK cliente para Firebase Auth (Google e E-mail/Senha)
 * ============================================================================
 */

import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

// No navegador/Vite usa import.meta.env; nos testes em Node (sem Vite) cai para process.env.
const env: Record<string, any> =
  (typeof import.meta !== 'undefined' && (import.meta as any).env) ||
  (typeof process !== 'undefined' ? process.env : {}) ||
  {};

// A configuração de um app web do Firebase é PÚBLICA por design (a segurança vem das regras e dos domínios autorizados).
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "AIzaSyCtBassIujzhzmxtsX2L9uCbgcJ3wD2094",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "vanescolar-9afde.firebaseapp.com",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "vanescolar-9afde",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "vanescolar-9afde.firebasestorage.app",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1046802826851",
  appId: env.VITE_FIREBASE_APP_ID || "1:1046802826851:web:13429814300911ad451a56"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
