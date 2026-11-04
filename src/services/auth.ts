/**
 * ============================================================================
 * SERVIÇO DE AUTENTICAÇÃO (services/auth.ts)
 * Integração com Firebase Auth, Gestão de Convites e Sessão Segura.
 * ============================================================================
 */

import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail, 
  signInWithPopup,
  sendEmailVerification,
  signOut,
  UserCredential
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';

const SESSION_TOKEN_KEY = 'van_token';
let memoryToken: string | null = null;

export const AuthService = {
  /**
   * Armazena o token de sessão localmente
   */
  setSessionToken(token: string) {
    memoryToken = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
  },

  /**
   * Recupera o token de sessão atual
   */
  getSessionToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(SESSION_TOKEN_KEY) || memoryToken;
    }
    return memoryToken;
  },

  /**
   * Remove a sessão local
   */
  clearSession() {
    memoryToken = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    }
  },

  /**
   * Login com E-mail e Senha via Firebase
   */
  async loginWithEmail(email: string, pass: string): Promise<UserCredential> {
    if (auth.config.apiKey.includes('MockKey')) {
      console.warn('AuthService: Utilizando bypass de teste para login.');
      return { user: { email, getIdToken: async () => 'mock-id-token' } } as any;
    }
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      return userCredential;
    } catch (error: any) {
      console.error('Erro no login Firebase:', error.code, error.message);
      throw this.mapFirebaseError(error);
    }
  },

  /**
   * Cadastro com E-mail e Senha via Firebase
   */
  async registerWithEmail(email: string, pass: string): Promise<UserCredential> {
    if (auth.config.apiKey.includes('MockKey')) {
      console.warn('AuthService: Utilizando bypass de teste para cadastro.');
      return { user: { email, uid: 'mock-uid', getIdToken: async () => 'mock-id-token' } } as any;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      // Envia verificação de e-mail automaticamente após cadastro
      await sendEmailVerification(userCredential.user);
      return userCredential;
    } catch (error: any) {
      console.error('Erro no cadastro Firebase:', error.code, error.message);
      throw this.mapFirebaseError(error);
    }
  },

  /**
   * Login via Google (Popup)
   */
  async loginWithGoogle(): Promise<UserCredential> {
    if (auth.config.apiKey.includes('MockKey')) {
       return { user: { email: 'leandrosolon@gmail.com', displayName: 'Leandro Solon (Super Admin)', getIdToken: async () => 'mock-id-token' } } as any;
    }
    try {
      const result = await signInWithPopup(auth, googleProvider);
      return result;
    } catch (error: any) {
      console.error('Erro no Google Auth:', error);
      throw this.mapFirebaseError(error);
    }
  },

  /**
   * Recuperação de Senha
   */
  async recoverPassword(email: string) {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      throw this.mapFirebaseError(error);
    }
  },

  /**
   * Logout completo (Firebase + Local)
   */
  async logout() {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Erro ao deslogar do Firebase:', err);
    }
    this.clearSession();
  },

  /**
   * Mapeamento de erros amigáveis em PT-BR
   */
  mapFirebaseError(error: any): Error {
    let message = 'Ocorreu um erro inesperado na autenticação.';
    
    switch (error.code) {
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        message = 'E-mail ou senha incorretos.';
        break;
      case 'auth/email-already-in-use':
        message = 'Este e-mail já está sendo utilizado.';
        break;
      case 'auth/weak-password':
        message = 'A senha fornecida é muito fraca.';
        break;
      case 'auth/invalid-email':
        message = 'O formato do e-mail é inválido.';
        break;
      case 'auth/popup-closed-by-user':
        message = 'A janela de autenticação foi fechada antes de concluir.';
        break;
    }
    
    return new Error(message);
  }
};
