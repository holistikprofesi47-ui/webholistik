import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  documentId,
  limit,
  startAfter,
  onSnapshot,
  QueryConstraint
} from 'firebase/firestore';
import { auth, getFriendlyErrorMessage } from './firebaseAuth';
import { db } from '../firebase';
export { db };
import {
  UserProfile,
  Appointment,
  ClinicalProgressNote,
  NurseClinicalRecord,
} from '../types';
import {
  FIRESTORE_CACHE_KEYS,
  FIRESTORE_CACHE_TTL,
  getCachedData,
  setCachedData,
  invalidateCacheByPrefix
} from '../utils/firestoreCache';

export const FIRESTORE_PAGE_LIMITS = {
  USERS: 25,
  APPOINTMENTS: 40,
  PROGRESS_NOTES: 25,
  NURSE_RECORDS: 20,
  BOOKED_SLOTS_PER_DATE: 50
} as const;

export interface PaginatedResult<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
  fromCache: boolean;
}

export interface SubscriptionPageInfo {
  cursor: string | null;
  hasMore: boolean;
}

interface CachedPage<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}

function getCachedPage<T>(key: string): PaginatedResult<T> | null {
  const cached = getCachedData<CachedPage<T>>(key);
  return cached ? { ...cached, fromCache: true } : null;
}

function cachePage<T>(key: string, page: PaginatedResult<T>, ttl: number): void {
  const { items, cursor, hasMore } = page;
  setCachedData(key, { items, cursor, hasMore }, ttl);
}

function makePageCacheKey(prefix: string, scope: string, cursor?: string | null): string {
  return `${prefix}${scope}_${cursor || 'first'}`;
}

function withoutProfilePassword(profile: UserProfile): UserProfile {
  const { password: _password, ...safeProfile } = profile;
  return safeProfile;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isOfflineOrNetworkError(err: any): boolean {
  if (!err) return false;
  const msg = (err?.message || String(err)).toLowerCase();
  const code = (err?.code || '').toLowerCase();
  return (
    msg.includes('offline') ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document') ||
    msg.includes('unavailable') ||
    msg.includes('deadline-exceeded') ||
    msg.includes('network') ||
    code.includes('unavailable') ||
    code.includes('deadline-exceeded')
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.warn('Firestore Operation Notice (Debug):', errInfo);
  if (!isOfflineOrNetworkError(error)) {
    const friendly = getFriendlyErrorMessage(error, 'Koneksi internet atau server sedang bermasalah. Silakan periksa kembali koneksi Anda atau coba beberapa saat lagi.');
    throw new Error(friendly);
  }
}

// ================= USER PROFILES =================

export async function saveUserProfileToFirestore(profile: UserProfile): Promise<void> {
  const path = `users/${profile.id}`;
  try {
    const userDocRef = doc(db, 'users', profile.id);
    const cleanData: Record<string, any> = {
      id: profile.id,
      name: profile.name || '',
      patientNumber: profile.patientNumber || '',
      phone: profile.phone || '',
      email: (profile.email || '').toLowerCase().trim(),
      dateOfBirth: profile.dateOfBirth || '',
      gender: profile.gender || '',
      maritalStatus: profile.maritalStatus || '',
      occupation: profile.occupation || '',
      address: profile.address || '',
      emergencyContact: profile.emergencyContact || '',
      medicalNotes: profile.medicalNotes || '',
      joinedDate: profile.joinedDate || new Date().toISOString().split('T')[0],
      isGuest: Boolean(profile.isGuest),
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, cleanData, { merge: true });
    setCachedData(
      `${FIRESTORE_CACHE_KEYS.USER_PROFILE_PREFIX}${profile.id}`,
      cleanData as UserProfile,
      FIRESTORE_CACHE_TTL.USER_PROFILE
    );
    invalidateCacheByPrefix(FIRESTORE_CACHE_KEYS.USERS_DIRECTORY);
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('User profile queued in Firestore local cache (offline mode).');
    }
  }
}

export async function getUserProfileFromFirestore(
  userId: string,
  forceRefresh = false
): Promise<UserProfile | null> {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return null;

  const cacheKey = `${FIRESTORE_CACHE_KEYS.USER_PROFILE_PREFIX}${userId}`;
  if (!forceRefresh) {
    const cached = getCachedData<UserProfile>(cacheKey);
    if (cached) return cached;
  }

  const path = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    if (snap && snap.exists()) {
      const profile = snap.data() as UserProfile;
      setCachedData(cacheKey, withoutProfilePassword(profile), FIRESTORE_CACHE_TTL.USER_PROFILE);
      return profile;
    }
    return null;
  } catch (err: any) {
    console.warn(`getUserProfileFromFirestore notice for ${userId}:`, err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      try {
        handleFirestoreError(err, OperationType.GET, path);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export async function getUserProfileByIdentifier(identifier: string): Promise<UserProfile | null> {
  const rawIdentifier = identifier.trim();
  if (!rawIdentifier) return null;

  const candidates: Array<{ field: 'email' | 'patientNumber' | 'phone'; value: string }> = [];
  if (rawIdentifier.includes('@')) {
    candidates.push({ field: 'email', value: rawIdentifier.toLowerCase() });
  } else if (/^rm[\s-]/i.test(rawIdentifier)) {
    candidates.push({ field: 'patientNumber', value: rawIdentifier.toUpperCase() });
  } else {
    candidates.push({ field: 'phone', value: rawIdentifier });
    const digitsOnly = rawIdentifier.replace(/\D/g, '');
    if (digitsOnly && digitsOnly !== rawIdentifier) {
      candidates.push({ field: 'phone', value: digitsOnly });
    }
  }

  const path = 'users';
  try {
    const usersRef = collection(db, 'users');
    for (const candidate of candidates) {
      const lookup = query(
        usersRef,
        where(candidate.field, '==', candidate.value),
        limit(1)
      );
      const snap = await getDocs(lookup);
      const profileDoc = snap.docs[0];
      if (profileDoc) {
        const profile = profileDoc.data() as UserProfile;
        setCachedData(
          `${FIRESTORE_CACHE_KEYS.USER_PROFILE_PREFIX}${profileDoc.id}`,
          withoutProfilePassword(profile),
          FIRESTORE_CACHE_TTL.USER_PROFILE
        );
        return profile;
      }
    }
    return null;
  } catch (err: any) {
    console.warn('getUserProfileByIdentifier notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.GET, path);
    }
    throw err;
  }
}

export async function getUserProfilesPage(cursor: string | null = null): Promise<PaginatedResult<UserProfile>> {
  if (!auth.currentUser) {
    throw new Error('Sesi Firebase diperlukan untuk memuat direktori pasien.');
  }

  const cacheKey = makePageCacheKey(
    FIRESTORE_CACHE_KEYS.USERS_DIRECTORY,
    'all',
    cursor
  );
  const cached = getCachedPage<UserProfile>(cacheKey);
  if (cached) return cached;

  try {
    const constraints: QueryConstraint[] = [orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(FIRESTORE_PAGE_LIMITS.USERS));
    const snap = await getDocs(query(collection(db, 'users'), ...constraints));
    const items = snap.docs.map((profileDoc) =>
      withoutProfilePassword(profileDoc.data() as UserProfile)
    );
    const lastDocument = snap.docs[snap.docs.length - 1];
    const page: PaginatedResult<UserProfile> = {
      items,
      cursor: lastDocument?.id || null,
      hasMore: snap.size === FIRESTORE_PAGE_LIMITS.USERS,
      fromCache: false
    };
    cachePage(cacheKey, page, FIRESTORE_CACHE_TTL.DIRECTORY);
    return page;
  } catch (err: any) {
    console.warn('getUserProfilesPage notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
    throw err;
  }
}

export async function getUserProfilesByIds(userIds: string[]): Promise<UserProfile[]> {
  if (!auth.currentUser) {
    throw new Error('Sesi Firebase diperlukan untuk memuat profil pasien.');
  }

  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const profiles: UserProfile[] = [];
  const uncachedIds: string[] = [];

  uniqueIds.forEach((userId) => {
    const cached = getCachedData<UserProfile>(
      `${FIRESTORE_CACHE_KEYS.USER_PROFILE_PREFIX}${userId}`
    );
    if (cached) profiles.push(cached);
    else uncachedIds.push(userId);
  });

  try {
    for (let index = 0; index < uncachedIds.length; index += 30) {
      const batch = uncachedIds.slice(index, index + 30);
      const profileQuery = query(
        collection(db, 'users'),
        where(documentId(), 'in', batch),
        limit(batch.length)
      );
      const snap = await getDocs(profileQuery);
      snap.docs.forEach((profileDoc) => {
        const profile = withoutProfilePassword(profileDoc.data() as UserProfile);
        profiles.push(profile);
        setCachedData(
          `${FIRESTORE_CACHE_KEYS.USER_PROFILE_PREFIX}${profileDoc.id}`,
          profile,
          FIRESTORE_CACHE_TTL.USER_PROFILE
        );
      });
    }
    return profiles;
  } catch (err: any) {
    console.warn('getUserProfilesByIds notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
    throw err;
  }
}

export function subscribeUserProfile(
  userId: string,
  onUpdate: (user: UserProfile | null) => void,
  onError?: (err: any) => void
) {
  const path = `users/${userId}`;
  const userDocRef = doc(db, 'users', userId);
  return onSnapshot(
    userDocRef,
    (snap) => {
      if (snap.exists()) {
        onUpdate(snap.data() as UserProfile);
      } else {
        onUpdate(null);
      }
    },
    (err) => {
      console.warn('subscribeUserProfile notice:', err?.message || err);
      if (onError) onError(err);
      if (!isOfflineOrNetworkError(err)) {
        try {
          handleFirestoreError(err, OperationType.GET, path);
        } catch {}
      }
    }
  );
}

// ================= APPOINTMENTS =================

export async function saveAppointmentToFirestore(appointment: Appointment): Promise<void> {
  const path = `appointments/${appointment.id}`;
  try {
    const appDocRef = doc(db, 'appointments', appointment.id);
    const payload = {
      ...appointment,
      userEmail: (appointment.userEmail || '').toLowerCase().trim(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(appDocRef, payload, { merge: true });
    invalidateCacheByPrefix(FIRESTORE_CACHE_KEYS.APPOINTMENTS_PREFIX);
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('Appointment save queued in Firestore local cache.');
    }
  }
}

export async function deleteAppointmentFromFirestore(appointmentId: string): Promise<void> {
  const path = `appointments/${appointmentId}`;
  try {
    const appDocRef = doc(db, 'appointments', appointmentId);
    await deleteDoc(appDocRef);
    invalidateCacheByPrefix(FIRESTORE_CACHE_KEYS.APPOINTMENTS_PREFIX);
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export function subscribeAppointments(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  onUpdate: (appointments: Appointment[], pageInfo: SubscriptionPageInfo) => void,
  onError?: (err: any) => void
) {
  const path = 'appointments';
  const appointmentsRef = collection(db, 'appointments');
  if (!isAdmin && (!currentUser || currentUser.isGuest || !currentUser.id)) {
    onUpdate([], { cursor: null, hasMore: false });
    return () => {};
  }

  const constraints: QueryConstraint[] = [];
  if (!isAdmin && currentUser?.id) {
    constraints.push(where('userId', '==', currentUser.id));
  }
  constraints.push(orderBy(documentId(), 'desc'), limit(FIRESTORE_PAGE_LIMITS.APPOINTMENTS));
  const q = query(appointmentsRef, ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => docSnap.data() as Appointment);
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onUpdate(list, {
        cursor: snapshot.docs[snapshot.docs.length - 1]?.id || null,
        hasMore: snapshot.size === FIRESTORE_PAGE_LIMITS.APPOINTMENTS
      });
    },
    (err) => {
      console.warn('subscribeAppointments notice:', err?.message || err);
      if (onError) onError(err);
      if (!isOfflineOrNetworkError(err)) {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {}
      }
    }
  );
}

export async function getAppointmentsPage(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  cursor: string | null
): Promise<PaginatedResult<Appointment>> {
  if (!auth.currentUser) {
    throw new Error('Sesi Firebase diperlukan untuk memuat halaman jadwal.');
  }
  if (!isAdmin && (!currentUser || currentUser.isGuest || !currentUser.id)) {
    return { items: [], cursor: null, hasMore: false, fromCache: false };
  }

  const scope = isAdmin ? `admin_${auth.currentUser.uid}` : currentUser!.id;
  const cacheKey = makePageCacheKey(FIRESTORE_CACHE_KEYS.APPOINTMENTS_PREFIX, scope, cursor);
  const cached = getCachedPage<Appointment>(cacheKey);
  if (cached) return cached;

  try {
    const constraints: QueryConstraint[] = [];
    if (!isAdmin && currentUser?.id) {
      constraints.push(where('userId', '==', currentUser.id));
    }
    constraints.push(orderBy(documentId(), 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(FIRESTORE_PAGE_LIMITS.APPOINTMENTS));
    const snap = await getDocs(query(collection(db, 'appointments'), ...constraints));
    const items = snap.docs.map((appointmentDoc) => appointmentDoc.data() as Appointment);
    items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    const page: PaginatedResult<Appointment> = {
      items,
      cursor: snap.docs[snap.docs.length - 1]?.id || null,
      hasMore: snap.size === FIRESTORE_PAGE_LIMITS.APPOINTMENTS,
      fromCache: false
    };
    cachePage(cacheKey, page, FIRESTORE_CACHE_TTL.DYNAMIC_COLLECTION);
    return page;
  } catch (err: any) {
    console.warn('getAppointmentsPage notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    }
    throw err;
  }
}

export async function getAppointmentsForDate(date: string): Promise<Appointment[]> {
  const normalizedDate = date.split('T')[0].trim();
  if (!normalizedDate) return [];

  try {
    const appointmentsQuery = query(
      collection(db, 'appointments'),
      where('date', '==', normalizedDate),
      limit(FIRESTORE_PAGE_LIMITS.BOOKED_SLOTS_PER_DATE)
    );
    const snap = await getDocs(appointmentsQuery);
    return snap.docs.map((appointmentDoc) => appointmentDoc.data() as Appointment);
  } catch (err: any) {
    console.warn('getAppointmentsForDate notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'appointments');
    }
    throw err;
  }
}

// ================= CLINICAL PROGRESS NOTES =================

export async function saveProgressNoteToFirestore(note: ClinicalProgressNote): Promise<void> {
  const path = `clinical_progress_notes/${note.id}`;
  try {
    const noteDocRef = doc(db, 'clinical_progress_notes', note.id);
    const payload = {
      ...note,
      patientEmail: (note.patientEmail || '').toLowerCase().trim(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(noteDocRef, payload, { merge: true });
    invalidateCacheByPrefix(FIRESTORE_CACHE_KEYS.PROGRESS_NOTES_PREFIX);
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('Progress note save queued in Firestore local cache.');
    }
  }
}

export async function deleteProgressNoteFromFirestore(noteId: string): Promise<void> {
  const path = `clinical_progress_notes/${noteId}`;
  try {
    const noteDocRef = doc(db, 'clinical_progress_notes', noteId);
    await deleteDoc(noteDocRef);
    invalidateCacheByPrefix(FIRESTORE_CACHE_KEYS.PROGRESS_NOTES_PREFIX);
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export function subscribeProgressNotes(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  onUpdate: (notes: ClinicalProgressNote[], pageInfo: SubscriptionPageInfo) => void,
  onError?: (err: any) => void
) {
  const path = 'clinical_progress_notes';
  const notesRef = collection(db, 'clinical_progress_notes');

  const constraints: QueryConstraint[] = [];
  if (!isAdmin) {
    if (currentUser && currentUser.id && !currentUser.isGuest) {
      constraints.push(where('patientId', '==', currentUser.id));
    } else {
      onUpdate([], { cursor: null, hasMore: false });
      return () => {};
    }
  }
  constraints.push(orderBy(documentId(), 'desc'), limit(FIRESTORE_PAGE_LIMITS.PROGRESS_NOTES));
  const q = query(notesRef, ...constraints);

  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => docSnap.data() as ClinicalProgressNote);
      list.sort((a, b) => new Date(b.visitDate || 0).getTime() - new Date(a.visitDate || 0).getTime());
      onUpdate(list, {
        cursor: snapshot.docs[snapshot.docs.length - 1]?.id || null,
        hasMore: snapshot.size === FIRESTORE_PAGE_LIMITS.PROGRESS_NOTES
      });
    },
    (err) => {
      console.warn('subscribeProgressNotes notice:', err?.message || err);
      if (onError) onError(err);
      if (!isOfflineOrNetworkError(err)) {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {}
      }
    }
  );
}

export async function getProgressNotesPage(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  cursor: string | null
): Promise<PaginatedResult<ClinicalProgressNote>> {
  if (!auth.currentUser) {
    throw new Error('Sesi Firebase diperlukan untuk memuat halaman catatan klinis.');
  }
  if (!isAdmin && (!currentUser || currentUser.isGuest || !currentUser.id)) {
    return { items: [], cursor: null, hasMore: false, fromCache: false };
  }

  const scope = isAdmin ? `admin_${auth.currentUser.uid}` : currentUser!.id;
  const cacheKey = makePageCacheKey(FIRESTORE_CACHE_KEYS.PROGRESS_NOTES_PREFIX, scope, cursor);
  const cached = getCachedPage<ClinicalProgressNote>(cacheKey);
  if (cached) return cached;

  try {
    const constraints: QueryConstraint[] = [];
    if (!isAdmin && currentUser?.id) {
      constraints.push(where('patientId', '==', currentUser.id));
    }
    constraints.push(orderBy(documentId(), 'desc'));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(FIRESTORE_PAGE_LIMITS.PROGRESS_NOTES));
    const snap = await getDocs(query(collection(db, 'clinical_progress_notes'), ...constraints));
    const items = snap.docs.map((noteDoc) => noteDoc.data() as ClinicalProgressNote);
    items.sort((a, b) => new Date(b.visitDate || 0).getTime() - new Date(a.visitDate || 0).getTime());
    const page: PaginatedResult<ClinicalProgressNote> = {
      items,
      cursor: snap.docs[snap.docs.length - 1]?.id || null,
      hasMore: snap.size === FIRESTORE_PAGE_LIMITS.PROGRESS_NOTES,
      fromCache: false
    };
    cachePage(cacheKey, page, FIRESTORE_CACHE_TTL.DYNAMIC_COLLECTION);
    return page;
  } catch (err: any) {
    console.warn('getProgressNotesPage notice:', err?.message || err);
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.LIST, 'clinical_progress_notes');
    }
    throw err;
  }
}
// ================= REGISTRATIONS (Form Pendaftaran Akun DipoCare) =================

export interface PatientRegistrationRecord {
  id: string;
  patientName: string;
  patientPhone: string;
  email: string;
  dateOfBirth: string;
  gender: UserProfile['gender'];
  maritalStatus?: UserProfile['maritalStatus'];
  occupation?: string;
  attendanceStatus?: string;
  createdAt?: string;
  updatedAt?: string;
}

export async function saveRegistrationToFirestore(reg: PatientRegistrationRecord): Promise<void> {
  const path = `registrations/${reg.id}`;
  try {
    const regDocRef = doc(db, 'registrations', reg.id);
    const payload = {
      id: reg.id,
      patientName: reg.patientName || '',
      patientPhone: reg.patientPhone || '',
      email: (reg.email || '').toLowerCase().trim(),
      dateOfBirth: reg.dateOfBirth,
      gender: reg.gender,
      maritalStatus: reg.maritalStatus || '',
      occupation: reg.occupation || '',
      attendanceStatus: reg.attendanceStatus || 'Belum Hadir',
      createdAt: reg.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(regDocRef, payload, { merge: true });
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('Registration queued in Firestore local cache.');
    }
  }
}

// ================= PRIVATE NURSE CLINICAL RECORDS =================

export async function saveNurseClinicalRecord(record: Omit<NurseClinicalRecord, 'id'>): Promise<void> {
  const path = 'nurse_clinical_records';
  const docRef = await addDoc(collection(db, path), record);
  if (!docRef.id) throw new Error('Catatan klinis perawat gagal memperoleh ID dokumen.');
}

export function subscribeNurseClinicalRecords(
  patientId: string,
  onUpdate: (records: NurseClinicalRecord[], pageInfo: SubscriptionPageInfo) => void,
  onError?: (error: Error) => void
) {
  const path = 'nurse_clinical_records';
  const recordsQuery = query(
    collection(db, path),
    where('patientId', '==', patientId),
    orderBy(documentId(), 'desc'),
    limit(FIRESTORE_PAGE_LIMITS.NURSE_RECORDS)
  );
  return onSnapshot(
    recordsQuery,
    (snapshot) => {
      const records = snapshot.docs.map((record) => ({
        ...record.data(),
        id: record.id
      } as NurseClinicalRecord));
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onUpdate(records, {
        cursor: snapshot.docs[snapshot.docs.length - 1]?.id || null,
        hasMore: snapshot.size === FIRESTORE_PAGE_LIMITS.NURSE_RECORDS
      });
    },
    (error) => {
      console.warn('Private nurse clinical records listener failed:', error);
      onError?.(error);
    }
  );
}

export async function getNurseClinicalRecordsPage(
  patientId: string,
  cursor: string
): Promise<PaginatedResult<NurseClinicalRecord>> {
  if (!auth.currentUser) {
    throw new Error('Sesi Firebase diperlukan untuk memuat rekam SOAP.');
  }

  const recordsQuery = query(
    collection(db, 'nurse_clinical_records'),
    where('patientId', '==', patientId),
    orderBy(documentId(), 'desc'),
    startAfter(cursor),
    limit(FIRESTORE_PAGE_LIMITS.NURSE_RECORDS)
  );
  const snapshot = await getDocs(recordsQuery);
  const items = snapshot.docs.map((record) => ({
    ...record.data(),
    id: record.id
  } as NurseClinicalRecord));
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    items,
    cursor: snapshot.docs[snapshot.docs.length - 1]?.id || null,
    hasMore: snapshot.size === FIRESTORE_PAGE_LIMITS.NURSE_RECORDS,
    fromCache: false
  };
}

// ================= CLINICAL RECORDS (Legacy therapist records) =================

export interface ClinicalRecordData {
  patientId: string;
  vitalSigns: {
    bloodPressure: string;
    heartRate: string;
    respiratoryRate: string;
    painLevel: string | number;
  };
  chiefComplaint: string;
  clinicalAssessment: string;
  intervention: string;
  evaluation: string;
  nurseInCharge: string;
  createdAt?: string;
}

export async function saveClinicalRecordToFirestore(record: ClinicalRecordData): Promise<string> {
  const path = 'clinical_records';
  try {
    const recordsCol = collection(db, 'clinical_records');
    const docRef = await addDoc(recordsCol, {
      ...record,
      createdAt: record.createdAt || new Date().toISOString()
    });
    return docRef.id;
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('Clinical record save notice (offline mode).');
    }
    return `local-${Date.now()}`;
  }
}
