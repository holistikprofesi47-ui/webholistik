import { safeStorage } from './storage';

const CACHE_PREFIX = 'hnc_fs_cache_v1_';

export const FIRESTORE_CACHE_TTL = {
  /** Profil user individu & verifikasi hak akses admin - 30 menit */
  USER_PROFILE: 30 * 60 * 1000,
  /** Direktori pasien terpaginasi - 10 menit */
  DIRECTORY: 10 * 60 * 1000,
  /** Daftar jadwal, catatan perkembangan, rekam medis - 3 menit */
  DYNAMIC_COLLECTION: 3 * 60 * 1000
} as const;

export const FIRESTORE_CACHE_KEYS = {
  USER_PROFILE_PREFIX: 'user_profile_',
  USERS_DIRECTORY: 'users_directory_',
  APPOINTMENTS_PREFIX: 'appointments_',
  PROGRESS_NOTES_PREFIX: 'progress_notes_'
} as const;

interface CacheEnvelope<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

function buildStorageKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

export function getCachedData<T>(key: string): T | null {
  const storageKey = buildStorageKey(key);
  const raw = safeStorage.get(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed.expiresAt !== 'number') {
      safeStorage.remove(storageKey);
      return null;
    }

    if (Date.now() > parsed.expiresAt) {
      safeStorage.remove(storageKey);
      return null;
    }

    return parsed.data;
  } catch {
    safeStorage.remove(storageKey);
    return null;
  }
}

export function setCachedData<T>(key: string, data: T, ttlMs: number): void {
  const now = Date.now();
  const envelope: CacheEnvelope<T> = {
    data,
    cachedAt: now,
    expiresAt: now + ttlMs
  };
  try {
    safeStorage.set(buildStorageKey(key), JSON.stringify(envelope));
  } catch {
    // Abaikan jika kuota localStorage browser penuh
  }
}

export function invalidateCacheKey(key: string): void {
  safeStorage.remove(buildStorageKey(key));
}

export function invalidateCacheByPrefix(prefix: string): void {
  if (typeof window === 'undefined') return;

  try {
    const storage = window.localStorage;
    const fullPrefix = buildStorageKey(prefix);
    const keysToRemove: string[] = [];
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (k && k.startsWith(fullPrefix)) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => safeStorage.remove(k));
  } catch {
    // Abaikan error akses storage
  }
}
