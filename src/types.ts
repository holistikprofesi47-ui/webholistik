export type TherapyCategory = 'massage' | 'cupping' | 'exercise' | 'spa' | 'mind-body';

export interface Therapy {
  id: string;
  name: string;
  category: TherapyCategory;
  tagline: string;
  description: string;
  definition: string;
  benefits: string[];
  indications: string[];
  precautions: string[];
  contraindications: string[];
  techniquesOrSteps?: string[];
  durationMinutes: number;
  durationText: string;
  image: string;
  iconName: string;
  specialWarning?: string;
  scheduleNote?: string;
  allowedDays?: number[]; // e.g. [5, 6] for Friday and Saturday (0=Sunday, 1=Monday... 5=Friday, 6=Saturday)
}

export interface Video {
  id: string;
  title: string;
  category: 'Massage' | 'Cupping' | 'Akupresur' | 'Relaksasi' | 'Mind-body therapy';
  youtubeId: string;
  youtubeUrl: string;
  duration: string;
  description: string;
  thumbnail: string;
  author?: string;
}

export type AppointmentStatus = 'Menunggu' | 'Terjadwal' | 'Selesai' | 'Dibatalkan';

export interface LocationItem {
  id: string;
  name: string;
  address: string;
  buildingRoom?: string;
  city: string;
  operatingHoursText?: string;
  startHour?: number;
  endHour?: number;
  endMinute?: number;
}

export interface Appointment {
  id: string;
  bookingCode: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail?: string;
  patientNumber: string;
  dateOfBirth?: string;
  gender?: UserProfile['gender'];
  maritalStatus?: UserProfile['maritalStatus'];
  occupation?: string;
  therapyId: string;
  therapyName: string;
  locationId: string;
  locationName: string;
  date: string; // YYYY-MM-DD
  dayName: string; // Senin, Selasa, etc.
  timeSlot: string; // HH:mm e.g. "09:00"
  notes?: string;
  status: AppointmentStatus;
  createdAt: string;
  cancelledReason?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  patientNumber: string;
  phone: string;
  email: string;
  dateOfBirth?: string;
  gender?: 'Laki-laki' | 'Perempuan';
  maritalStatus?: 'Belum menikah' | 'Sudah menikah';
  occupation?: string;
  password?: string;
  address: string;
  emergencyContact?: string;
  medicalNotes?: string;
  joinedDate: string;
  isGuest?: boolean;
}

export interface ClinicalProgressNote {
  id: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  patientPhone?: string;
  patientEmail?: string;
  appointmentId?: string;
  bookingCode?: string;
  therapyName: string;
  visitDate: string; // YYYY-MM-DD
  chiefComplaint: string; // Keluhan Utama
  assessment: string; // Hasil Pengkajian (Asesmen / Tanda Vital / Keadaan Klinis)
  vitalSigns?: {
    bloodPressure?: string;
    pulseRate?: string;
    respiratoryRate?: string;
    painScale?: number;
  };
  intervention: string; // Intervensi yang Diberikan
  progressFollowUp: string; // Catatan Perkembangan / Tindak Lanjut Medis
  nurseName: string; // Nama Tenaga Kesehatan / Perawat Penanggung Jawab
  createdAt: string;
}

export interface NurseClinicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  patientNumber: string;
  appointmentId?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  nurseName: string;
  profession: 'Perawat Penanggung Jawab / Ners';
  createdAt: string;
}

export type ActiveTab = 'home' | 'therapies' | 'videos' | 'appointments' | 'profile' | 'admin';
