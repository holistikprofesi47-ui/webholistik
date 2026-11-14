/**
 * Firebase Realtime Database Service
 * Provides helper functions for syncing appointments and patient profiles to Realtime Database (RTDB)
 */
import { ref, set, get, child, onValue, off } from 'firebase/database';
import { rtdb } from '../firebase';
import { Appointment, UserProfile } from '../types';

export async function saveAppointmentToRTDB(appointment: Appointment): Promise<void> {
  if (!rtdb) return;
  try {
    const appointmentRef = ref(rtdb, `appointments/${appointment.id}`);
    await set(appointmentRef, {
      ...appointment,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Realtime Database save notice (non-fatal):', err);
  }
}

export async function saveUserProfileToRTDB(profile: UserProfile): Promise<void> {
  if (!rtdb) return;
  try {
    const userRef = ref(rtdb, `users/${profile.id}`);
    await set(userRef, {
      ...profile,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.warn('Realtime Database profile save notice (non-fatal):', err);
  }
}
