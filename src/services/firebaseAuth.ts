import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
  signInAnonymously,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '../firebase';
import { safeStorage } from '../utils/storage';
export { auth };

export const registerWithEmailPassword = async (email: string, password: string): Promise<User> => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const loginWithEmailPassword = async (email: string, password: string): Promise<User> => {
  cachedAccessToken = null;
  safeStorage.remove('hnc_google_access_token');
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
};

export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
let cachedAccessToken: string | null = safeStorage.get('hnc_google_access_token');

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const token = cachedAccessToken || safeStorage.get('hnc_google_access_token');
      if (token && onAuthSuccess) {
        cachedAccessToken = token;
        onAuthSuccess(user, token);
      } else if (!isSigningIn && !user.isAnonymous) {
        if (onAuthFailure) onAuthFailure();
      }
    } else if (!isSigningIn) {
      cachedAccessToken = null;
      safeStorage.remove('hnc_google_access_token');
      if (onAuthFailure) onAuthFailure();
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.warn('Anonymous auth initialization (offline/fallback mode):', anonErr);
      }
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan token akses dari Google');
    }

    cachedAccessToken = credential.accessToken;
    safeStorage.set('hnc_google_access_token', credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || safeStorage.get('hnc_google_access_token');
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  safeStorage.remove('hnc_google_access_token');
};

export function getFriendlyErrorMessage(
  error: unknown,
  fallbackMessage = 'Koneksi internet atau server sedang bermasalah. Silakan periksa kembali koneksi Anda atau coba beberapa saat lagi.'
): string {
  if (!error) return fallbackMessage;
  const msg = error instanceof Error ? error.message : String(error);
  const code = (error as any)?.code || '';

  if (code === 'permission-denied' || msg.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return 'Akses ditolak: Anda tidak memiliki izin untuk melakukan tindakan ini.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded' || msg.toLowerCase().includes('offline')) {
    return fallbackMessage;
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Jendela login ditutup sebelum proses selesai.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Permintaan login dibatalkan.';
  }
  return msg || fallbackMessage;
}

