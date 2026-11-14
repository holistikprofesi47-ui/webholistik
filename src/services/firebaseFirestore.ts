import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot
} from 'firebase/firestore';
import { auth, getFriendlyErrorMessage } from './firebaseAuth';
import { db } from '../firebase';
export { db };
import { UserProfile, Appointment, ClinicalProgressNote } from '../types';

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
      address: profile.address || '',
      emergencyContact: profile.emergencyContact || '',
      medicalNotes: profile.medicalNotes || '',
      joinedDate: profile.joinedDate || new Date().toISOString().split('T')[0],
      isGuest: Boolean(profile.isGuest),
      updatedAt: new Date().toISOString()
    };
    await setDoc(userDocRef, cleanData, { merge: true });
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.WRITE, path);
    } else {
      console.info('User profile queued in Firestore local cache (offline mode).');
    }
  }
}

export async function getUserProfileFromFirestore(userId: string): Promise<UserProfile | null> {
  const path = `users/${userId}`;
  try {
    const userDocRef = doc(db, 'users', userId);
    const snap = await getDoc(userDocRef);
    if (snap && snap.exists()) {
      return snap.data() as UserProfile;
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

export async function getAllUserProfilesFromFirestore(): Promise<UserProfile[]> {
  const path = 'users';
  try {
    const usersRef = collection(db, 'users');
    const snap = await getDocs(usersRef);
    const list: UserProfile[] = [];
    snap.forEach((docSnap) => {
      list.push(docSnap.data() as UserProfile);
    });
    return list;
  } catch (err: any) {
    console.warn('getAllUserProfilesFromFirestore notice:', err?.message || err);
    return [];
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
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export function subscribeAppointments(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  onUpdate: (appointments: Appointment[]) => void,
  onError?: (err: any) => void
) {
  const path = 'appointments';
  const appointmentsRef = collection(db, 'appointments');
  const q = query(appointmentsRef);

  return onSnapshot(
    q,
    (snapshot) => {
      const list: Appointment[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as Appointment);
      });
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      onUpdate(list);
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
  } catch (err: any) {
    if (!isOfflineOrNetworkError(err)) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }
}

export function subscribeProgressNotes(
  currentUser: UserProfile | null,
  isAdmin: boolean,
  onUpdate: (notes: ClinicalProgressNote[]) => void,
  onError?: (err: any) => void
) {
  const path = 'clinical_progress_notes';
  const notesRef = collection(db, 'clinical_progress_notes');

  let q;
  if (isAdmin) {
    q = query(notesRef);
  } else if (currentUser && currentUser.id && !currentUser.isGuest) {
    q = query(notesRef, where('patientId', '==', currentUser.id));
  } else {
    onUpdate([]);
    return () => {};
  }

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ClinicalProgressNote[] = [];
      snapshot.forEach((docSnap) => {
        list.push(docSnap.data() as ClinicalProgressNote);
      });
      list.sort((a, b) => new Date(b.visitDate || 0).getTime() - new Date(a.visitDate || 0).getTime());
      onUpdate(list);
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

// ================= REGISTRATIONS (Form Pendaftaran Akun DipoCare) =================

export interface PatientRegistrationRecord {
  id: string;
  patientName: string;
  patientPhone: string;
  email: string;
  dateOfBirth: string;
  gender: UserProfile['gender'];
  maritalStatus?: UserProfile['maritalStatus'];
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

// ================= CLINICAL RECORDS (Mode Terapis / Rekam Medis) =================

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
