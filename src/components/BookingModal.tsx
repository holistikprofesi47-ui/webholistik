import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  CalendarCheck2,
  QrCode,
  Check,
  ShieldCheck
} from 'lucide-react';
import { Therapy, LocationItem, Appointment, UserProfile } from '../types';
import { GENERATE_TIME_SLOTS } from '../data/mockData';
import { generateBookingCode, getIndonesianDayName, formatIndonesianDate } from '../utils/storage';
import { appendAppointmentToSheet } from '../services/googleSheets';
import { appendPatientRegistrationToEndpoint } from '../services/patientRegistrationEndpoint';
import { saveAppointmentToFirestore } from '../services/firebaseFirestore';
import { saveAppointmentToRTDB } from '../services/firebaseRealtime';
import { safeStorage } from '../utils/storage';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  therapies: Therapy[];
  locations: LocationItem[];
  preSelectedTherapy?: Therapy | null;
  existingAppointments: Appointment[];
  currentUser: UserProfile;
  accessToken?: string | null;
  googleUser?: any | null;
  onAuthSuccess?: (user: any, token: string) => void;
  onBookingSuccess: (appointment: Appointment) => void;
  onGoToMyAppointments: () => void;
  onRequestAuth?: () => void;
}

export const BookingModal: React.FC<BookingModalProps> = ({
  isOpen,
  onClose,
  therapies,
  locations,
  preSelectedTherapy,
  existingAppointments,
  currentUser,
  accessToken,
  onBookingSuccess,
  onGoToMyAppointments,
  onRequestAuth
}) => {
  // Steps: 1. Terapi, 2. Lokasi, 3. Tanggal & Jam, 4. Data Pasien, 5. Ringkasan Konfirmasi, 6. Berhasil
  const [step, setStep] = useState<number>(1);

  // Form selections
  const [selectedTherapyId, setSelectedTherapyId] = useState<string>('');
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');

  // User form data
  const [patientName, setPatientName] = useState<string>('');
  const [patientNumber, setPatientNumber] = useState<string>('');
  const [patientGender, setPatientGender] = useState<UserProfile['gender'] | ''>('');
  const [patientPhone, setPatientPhone] = useState<string>('');
  const [patientEmail, setPatientEmail] = useState<string>('');
  const [maritalStatus, setMaritalStatus] = useState<UserProfile['maritalStatus'] | ''>('');
  const [occupation, setOccupation] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Validation error state
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [registrationSyncStatus, setRegistrationSyncStatus] = useState<
    'idle' | 'sending' | 'sent-unverified' | 'failed'
  >('idle');

  // Created appointment result
  const [createdAppointment, setCreatedAppointment] = useState<Appointment | null>(null);

  // Initialize or reset when opened
  useEffect(() => {
    if (isOpen) {
      if (preSelectedTherapy) {
        setSelectedTherapyId(preSelectedTherapy.id);
        setStep(2);
      } else {
        setSelectedTherapyId(therapies[0]?.id || '');
        setStep(1);
      }
      setSelectedLocationId(locations[0]?.id || 'undip-nursing');

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      if (tomorrow.getDay() === 0) {
        tomorrow.setDate(tomorrow.getDate() + 1);
      }
      const dateStr = tomorrow.toISOString().split('T')[0];
      setSelectedDate(dateStr);
      setSelectedTimeSlot('');

      setPatientName(currentUser.name || '');
      setPatientNumber(currentUser.patientNumber || '');
      setPatientGender(currentUser.gender || '');
      setPatientPhone(currentUser.phone || '');
      setPatientEmail(currentUser.email || '');
      setMaritalStatus(currentUser.maritalStatus || '');
      setOccupation(currentUser.occupation || '');
      setNotes('');
      setErrorMessage('');
      setRegistrationSyncStatus('idle');
      setCreatedAppointment(null);
    }
  }, [isOpen, preSelectedTherapy, therapies, locations, currentUser]);

  // Helper normalisasi string jam (menghapus "WIB" dan spasi)
  const normalizeTimeSlot = (timeStr?: string): string => {
    if (!timeStr) return '';
    return timeStr.replace(/\s*WIB/gi, '').trim();
  };

  const selectedTherapy = therapies.find(t => t.id === selectedTherapyId);
  const selectedLocation = locations.find(l => l.id === selectedLocationId);

  // Slot waktu tindakan dinamis sesuai jam operasional lokasi:
  // - Departemen Ilmu Keperawatan & SMPIT Cahaya Ummat: 08.00 - 15.30 WIB
  // - Dipocare Universitas Diponegoro: 08.00 - 20.30 WIB
  const allTimeSlots = useMemo(() => {
    return GENERATE_TIME_SLOTS(selectedLocationId || selectedLocation?.name);
  }, [selectedLocationId, selectedLocation]);

  // Map slot yang sudah dipesan (hanya dapat dipilih oleh 1 orang per sesi tindakan)
  const bookedSlotsMap = useMemo(() => {
    if (!selectedDate) return new Map<string, Appointment>();
    const booked = new Map<string, Appointment>();
    const cleanDate = selectedDate.split('T')[0].trim();

    existingAppointments.forEach((app) => {
      // Abaikan reservasi yang dibatalkan
      if (app.status === 'Dibatalkan') return;

      const appDate = (app.date || '').split('T')[0].trim();
      if (appDate !== cleanDate) return;

      // Cek apakah lokasi sama
      const isSameLocation =
        !selectedLocationId ||
        app.locationId === selectedLocationId ||
        (selectedLocation &&
          app.locationName &&
          (app.locationName.trim().toLowerCase() === selectedLocation.name.trim().toLowerCase() ||
            app.locationName.toLowerCase().includes(selectedLocation.name.toLowerCase()) ||
            selectedLocation.name.toLowerCase().includes(app.locationName.toLowerCase()))) ||
        (!app.locationId && !app.locationName);

      if (isSameLocation) {
        const cleanSlot = normalizeTimeSlot(app.timeSlot);
        if (cleanSlot) {
          booked.set(cleanSlot, app);
        }
      }
    });

    return booked;
  }, [selectedDate, selectedLocationId, selectedLocation, existingAppointments]);

  // Jika tanggal atau lokasi berubah dan jam terpilih ternyata sudah penuh atau di luar jam operasional lokasi, reset pilihan jam
  useEffect(() => {
    if (selectedTimeSlot) {
      const clean = normalizeTimeSlot(selectedTimeSlot);
      if (bookedSlotsMap.has(clean) || !allTimeSlots.includes(clean)) {
        setSelectedTimeSlot('');
      }
    }
  }, [selectedDate, selectedLocationId, bookedSlotsMap, selectedTimeSlot, allTimeSlots]);

  const isSunday = useMemo(() => {
    if (!selectedDate) return false;
    const d = new Date(selectedDate + 'T00:00:00');
    return d.getDay() === 0;
  }, [selectedDate]);

  const selectedDayOfWeek = useMemo(() => {
    if (!selectedDate) return null;
    const d = new Date(selectedDate + 'T00:00:00');
    return d.getDay();
  }, [selectedDate]);

  const isInvalidDayForTherapy = useMemo(() => {
    if (selectedDayOfWeek === null || !selectedTherapy?.allowedDays) return false;
    return !selectedTherapy.allowedDays.includes(selectedDayOfWeek);
  }, [selectedDayOfWeek, selectedTherapy]);

  const handleNextStep = () => {
    setErrorMessage('');

    if (step === 1) {
      if (!selectedTherapyId) {
        setErrorMessage('Silakan pilih salah satu terapi holistik terlebih dahulu.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!selectedLocationId) {
        setErrorMessage('Silakan pilih lokasi tindakan layanan.');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      if (!selectedDate) {
        setErrorMessage('Silakan pilih tanggal tindakan.');
        return;
      }
      if (isSunday) {
        setErrorMessage('Layanan tidak beroperasi pada hari Minggu. Silakan pilih hari operasional (Senin – Sabtu).');
        return;
      }
      if (isInvalidDayForTherapy && selectedTherapy) {
        setErrorMessage(`Sesi terapi ${selectedTherapy.name} hanya tersedia pada hari Jumat dan Sabtu. Silakan pilih tanggal di hari Jumat atau Sabtu.`);
        return;
      }
      if (!selectedTimeSlot) {
        setErrorMessage('Silakan pilih slot waktu tindakan yang masih tersedia.');
        return;
      }
      const cleanSlot = normalizeTimeSlot(selectedTimeSlot);
      if (!allTimeSlots.includes(cleanSlot)) {
        const opText = selectedLocation?.operatingHoursText || (selectedLocationId === 'undip-dipocare' ? '08.00 – 20.30 WIB' : '08.00 – 15.30 WIB');
        setErrorMessage(`Slot waktu ${cleanSlot} WIB berada di luar jam operasional ${selectedLocation?.name || 'lokasi'} (${opText}). Silakan pilih slot yang tersedia.`);
        return;
      }
      if (bookedSlotsMap.has(cleanSlot)) {
        setErrorMessage(`Slot waktu ${cleanSlot} WIB pada tanggal ini sudah dipesan oleh pasien lain. Sesi ini terbatas hanya dapat dipilih oleh 1 orang.`);
        return;
      }
      setStep(4);
    } else if (step === 4) {
      if (!patientName.trim()) {
        setErrorMessage('Nama lengkap pasien wajib diisi.');
        return;
      }
      if (!patientGender) {
        setErrorMessage('Jenis kelamin pasien wajib dipilih.');
        return;
      }
      if (!patientPhone.trim()) {
        setErrorMessage('Nomor telepon / WhatsApp wajib diisi.');
        return;
      }
      if (!maritalStatus) {
        setErrorMessage('Status perkawinan pasien wajib dipilih.');
        return;
      }
      if (!occupation.trim()) {
        setErrorMessage('Pekerjaan pasien wajib diisi.');
        return;
      }
      setStep(5);
    }
  };

  const handleConfirmBooking = async () => {
    if (!selectedTherapy || !selectedLocation) return;

    const cleanTime = normalizeTimeSlot(selectedTimeSlot);
    if (!cleanTime) {
      setErrorMessage('Silakan pilih slot waktu tindakan terlebih dahulu.');
      setStep(3);
      return;
    }

    if (!allTimeSlots.includes(cleanTime)) {
      const opText = selectedLocation.operatingHoursText || (selectedLocation.id === 'undip-dipocare' ? '08.00 – 20.30 WIB' : '08.00 – 15.30 WIB');
      setErrorMessage(`Slot jam ${cleanTime} WIB di luar jam operasional ${selectedLocation.name} (${opText}).`);
      setStep(3);
      return;
    }

    // 1. Guard lokal: memastikan slot belum terisi
    if (bookedSlotsMap.has(cleanTime)) {
      setErrorMessage(`Maaf, slot waktu ${cleanTime} WIB pada tanggal ini sudah dipesan oleh pasien lain. Sesi ini terbatas hanya untuk 1 orang.`);
      setStep(3);
      return;
    }

    try {
      const dayName = getIndonesianDayName(selectedDate);
      const formattedTime = `${cleanTime} WIB`;

      const newAppointment: Appointment = {
        id: 'app-' + Date.now(),
        bookingCode: generateBookingCode(),
        userId: currentUser.id || 'user-guest',
        userName: patientName.trim(),
        userEmail: (patientEmail.trim() || currentUser.email || '').toLowerCase(),
        userPhone: patientPhone.trim(),
        patientNumber: patientNumber.trim() || 'HNC-PASIEN-' + Math.floor(100000 + Math.random() * 900000),
        dateOfBirth: currentUser.dateOfBirth || '',
        gender: patientGender || undefined,
        maritalStatus: maritalStatus || undefined,
        occupation: occupation.trim(),
        therapyId: selectedTherapy.id,
        therapyName: selectedTherapy.name,
        locationId: selectedLocation.id,
        locationName: selectedLocation.name,
        date: selectedDate,
        dayName: dayName,
        timeSlot: cleanTime,
        notes: notes.trim(),
        status: 'Menunggu',
        createdAt: new Date().toISOString()
      };

      setCreatedAppointment(newAppointment);

      // Simpan data ke Firebase Firestore & Realtime Database (holistik-dcd95)
      try {
        await saveAppointmentToFirestore(newAppointment);
        await saveAppointmentToRTDB(newAppointment);
      } catch (fbErr) {
        console.warn('Firebase save notice:', fbErr);
      }

      // Jalankan handler sukses & pindah ke layar e-Tiket (Step 6)
      if (typeof onBookingSuccess === 'function') {
        onBookingSuccess(newAppointment);
      }

      setStep(6);

      setRegistrationSyncStatus('sending');
      try {
        await appendPatientRegistrationToEndpoint(newAppointment);
        setRegistrationSyncStatus('sent-unverified');
      } catch (syncErr) {
        console.error('Gagal mengirim pendaftaran ke spreadsheet:', syncErr);
        setRegistrationSyncStatus('failed');
      }

      // Sync ke Google Spreadsheet jika token tersedia
      const activeToken = accessToken || safeStorage.get('hnc_google_access_token');
      if (activeToken) {
        try {
          await appendAppointmentToSheet(activeToken, newAppointment);
        } catch (syncErr) {
          console.warn('Sync sheet error:', syncErr);
        }
      }
    } catch (err: any) {
      console.error('Error confirming booking:', err);
      setErrorMessage('Terjadi kesalahan saat mengonfirmasi pendaftaran. Silakan coba lagi.');
    }
  };

  if (!isOpen) return null;

  if (currentUser.isGuest || !currentUser.email) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/80 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl border border-stone-200 space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-800 px-2.5 py-0.5 rounded-full border border-amber-200">
              Autentikasi Diperlukan
            </span>
            <h3 className="text-lg font-black text-stone-900 mt-2">Wajib Masuk / Daftar Akun Pasien</h3>
            <p className="text-xs text-stone-600 mt-2 leading-relaxed">
              Untuk menjamin privasi riwayat kesehatan, kepemilikan e-tiket, serta keamanan data rekam medis Anda, setiap pemesanan jadwal terapi wajib dilakukan melalui akun pasien yang terdaftar.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs py-2.5 rounded-xl transition cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={() => {
                onClose();
                if (onRequestAuth) onRequestAuth();
              }}
              className="flex-2 bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <User className="w-4 h-4 text-emerald-300" />
              <span>Masuk / Daftar Akun</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-stone-900/75 backdrop-blur-sm animate-fadeIn overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-stone-200 relative overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-stone-100 bg-emerald-900 text-white flex items-center justify-between">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold tracking-tight flex items-center gap-2">
              <CalendarCheck2 className="w-5 h-5 text-emerald-300" />
              PILIH JADWAL TINDAKAN
            </h2>
            <p className="text-xs text-emerald-200">
              Layanan Keperawatan Holistik Terjadwal (Senin – Sabtu, {selectedLocation?.operatingHoursText || '08.00–20.30 WIB'})
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-emerald-800/80 hover:bg-emerald-700 text-emerald-200 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        {step <= 5 && (
          <div className="px-6 pt-4 pb-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between text-[11px] font-semibold text-stone-500">
            <span className={step >= 1 ? 'text-emerald-800 font-bold' : ''}>1. Terapi</span>
            <span>›</span>
            <span className={step >= 2 ? 'text-emerald-800 font-bold' : ''}>2. Lokasi</span>
            <span>›</span>
            <span className={step >= 3 ? 'text-emerald-800 font-bold' : ''}>3. Waktu</span>
            <span>›</span>
            <span className={step >= 4 ? 'text-emerald-800 font-bold' : ''}>4. Data</span>
            <span>›</span>
            <span className={step >= 5 ? 'text-emerald-800 font-bold' : ''}>5. Konfirmasi</span>
          </div>
        )}

        {/* Modal Body Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 text-sm text-stone-700 space-y-4">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex items-start gap-2.5 text-rose-800 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: Pilih Terapi */}
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="font-bold text-stone-900 text-sm">Langkah 1: Pilih Jenis Terapi Holistik</h3>
              <div className="grid gap-2.5">
                {therapies.map((therapy) => (
                  <div
                    key={therapy.id}
                    onClick={() => setSelectedTherapyId(therapy.id)}
                    className={`p-3.5 rounded-2xl border transition flex items-center gap-3 cursor-pointer ${
                      selectedTherapyId === therapy.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    <img
                      src={therapy.image}
                      alt={therapy.name}
                      className="w-14 h-14 rounded-xl object-cover shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-stone-900 text-sm truncate">{therapy.name}</h4>
                          {therapy.scheduleNote && (
                            <span className="text-[10px] bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded-full">
                              Jumat & Sabtu
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-medium">
                          {therapy.durationText}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">{therapy.tagline}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                      selectedTherapyId === therapy.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300'
                    }`}>
                      {selectedTherapyId === therapy.id && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 2: Pilih Lokasi */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-stone-900 text-sm">Langkah 2: Pilih Lokasi Tindakan</h3>
                {selectedTherapy && (
                  <span className="text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold border border-emerald-200">
                    {selectedTherapy.name} ({selectedTherapy.durationText})
                  </span>
                )}
              </div>

              <div className="grid gap-3">
                {locations.map((loc) => (
                  <div
                    key={loc.id}
                    onClick={() => setSelectedLocationId(loc.id)}
                    className={`p-4 rounded-2xl border transition flex items-start gap-3 cursor-pointer ${
                      selectedLocationId === loc.id
                        ? 'border-emerald-600 bg-emerald-50/70 shadow-sm ring-2 ring-emerald-500/20'
                        : 'border-stone-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      selectedLocationId === loc.id ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
                    }`}>
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h4 className="font-bold text-stone-900 text-sm leading-snug">{loc.name}</h4>
                        {loc.operatingHoursText && (
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            loc.id === 'undip-dipocare'
                              ? 'bg-amber-100 text-amber-900 border-amber-300'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                          }`}>
                            <Clock className="w-3 h-3" />
                            {loc.operatingHoursText}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-stone-600 mt-1 leading-relaxed">{loc.address}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {loc.buildingRoom && (
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Ruang: {loc.buildingRoom}
                          </span>
                        )}
                        {loc.id === 'undip-dipocare' ? (
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded border border-indigo-200">
                            ⭐ Jam Kerja Sampai 20.30 WIB
                          </span>
                        ) : (
                          <span className="text-[10px] bg-stone-100 text-stone-600 font-medium px-2 py-0.5 rounded border border-stone-200">
                            Akses Sesi: 08.00 – 15.30 WIB
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                      selectedLocationId === loc.id ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-stone-300'
                    }`}>
                      {selectedLocationId === loc.id && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 3: Pilih Tanggal & Jam */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="font-bold text-stone-900 text-sm">Langkah 3: Pilih Hari, Tanggal & Slot Waktu</h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedLocation && (
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                      selectedLocation.id === 'undip-dipocare'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    }`}>
                      <Clock className="w-3 h-3" />
                      {selectedLocation.operatingHoursText || (selectedLocation.id === 'undip-dipocare' ? '08.00 – 20.30 WIB' : '08.00 – 15.30 WIB')}
                    </span>
                  )}
                  {selectedTherapy && (
                    <span className="text-xs text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full font-semibold border border-emerald-200">
                      {selectedTherapy.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Date Input */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 space-y-2">
                <label className="text-xs font-bold text-stone-700 block">
                  Pilih Tanggal Tindakan (Senin – Sabtu)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="date"
                    value={selectedDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setErrorMessage('');
                    }}
                    className={`w-full bg-white border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                      isInvalidDayForTherapy || isSunday ? 'border-rose-400' : 'border-stone-300'
                    }`}
                  />
                  <div className="shrink-0 text-right">
                    <span className={`text-xs font-bold px-3 py-2 rounded-xl block ${
                      isInvalidDayForTherapy || isSunday
                        ? 'text-rose-800 bg-rose-100'
                        : selectedDate
                        ? 'text-emerald-800 bg-emerald-100'
                        : 'text-stone-600 bg-stone-200'
                    }`}>
                      {selectedDate ? getIndonesianDayName(selectedDate) : 'Hari'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kebijakan Kuota 1 Pasien per Sesi Tindakan */}
              <div className="bg-emerald-50/80 border border-emerald-200/90 rounded-2xl p-3 sm:p-3.5 flex items-start gap-2.5 text-emerald-950 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold block text-emerald-950">
                    Sesi Terbatas: Kuota Maksimal 1 Orang Pasien per Slot Jam
                  </span>
                  Setiap slot waktu tindakan bersifat eksklusif untuk 1 pasien guna menjaga mutu asuhan keperawatan dan privasi pasien. Slot yang sudah terisi bertanda <strong className="text-rose-700">Penuh (1/1)</strong> dan tidak dapat dipilih orang lain.
                </div>
              </div>

              {/* Time Slots Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-stone-700 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-700" />
                    Pilih Jam Tindakan ({selectedLocation?.operatingHoursText || (selectedLocationId === 'undip-dipocare' ? '08.00 – 20.30 WIB' : '08.00 – 15.30 WIB')})
                  </label>
                  <span className="text-[11px] font-semibold text-stone-500">
                    {Math.max(0, allTimeSlots.length - bookedSlotsMap.size)} dari {allTimeSlots.length} sesi tersedia
                  </span>
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-56 overflow-y-auto p-1.5 border border-stone-200 rounded-2xl bg-stone-50/60">
                  {allTimeSlots.map((slot) => {
                    const cleanSlot = normalizeTimeSlot(slot);
                    const isBooked = bookedSlotsMap.has(cleanSlot);
                    const isSelected = selectedTimeSlot ? normalizeTimeSlot(selectedTimeSlot) === cleanSlot : false;

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={isBooked || isSunday}
                        title={
                          isSunday
                            ? 'Layanan libur di hari Minggu'
                            : isBooked
                            ? `Slot jam ${slot} WIB sudah dipesan (Penuh: 1/1 Orang)`
                            : `Pilih slot jam ${slot} WIB (Tersedia)`
                        }
                        onClick={() => {
                          if (isBooked || isSunday) return;
                          setSelectedTimeSlot(slot);
                          setErrorMessage('');
                        }}
                        className={`py-2 px-1 text-xs rounded-xl font-bold transition text-center flex flex-col items-center justify-center relative ${
                          isSunday
                            ? 'bg-stone-200 text-stone-400 cursor-not-allowed opacity-60'
                            : isBooked
                            ? 'bg-stone-100 text-stone-400 border border-stone-200/90 cursor-not-allowed opacity-75'
                            : isSelected
                            ? 'bg-emerald-700 text-white shadow-md ring-2 ring-emerald-500 cursor-pointer'
                            : 'bg-white hover:bg-emerald-50 text-stone-800 border border-stone-200/80 hover:border-emerald-300 cursor-pointer'
                        }`}
                      >
                        <span className={`text-[12px] leading-tight ${isBooked ? 'line-through text-stone-400' : ''}`}>
                          {slot}
                        </span>
                        {isBooked ? (
                          <span className="text-[9px] font-bold text-rose-600 block mt-0.5 leading-none tracking-tight">
                            Penuh (1/1)
                          </span>
                        ) : isSelected ? (
                          <span className="text-[9px] font-semibold text-emerald-100 block mt-0.5 leading-none">
                            Terpilih
                          </span>
                        ) : (
                          <span className="text-[9px] font-medium text-emerald-700 block mt-0.5 leading-none">
                            Tersedia
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Legend Keterangan Slot */}
                <div className="flex items-center justify-between text-[11px] text-stone-500 pt-2.5 px-1 flex-wrap gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-white border border-stone-300 inline-block"></span>
                    <span>Tersedia (Bisa Dipilih)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-700 inline-block"></span>
                    <span className="font-semibold text-emerald-800">Sesi Terpilih</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-200 border border-rose-300 inline-block"></span>
                    <span className="text-rose-700 font-medium">Penuh (1/1 Orang)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Isi Data Pasien */}
          {step === 4 && (
            <div className="space-y-3.5">
              <h3 className="font-bold text-stone-900 text-sm">Langkah 4: Lengkapi Data Pasien</h3>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nama Lengkap Pasien *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="Contoh: Bpk. Hendra Pratama"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Jenis Kelamin *
                </label>
                <select
                  required
                  value={patientGender}
                  onChange={(e) =>
                    setPatientGender(e.target.value as UserProfile['gender'] | '')
                  }
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                >
                  <option value="">Pilih jenis kelamin</option>
                  <option value="Laki-laki">Laki-laki</option>
                  <option value="Perempuan">Perempuan</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Nomor Telepon / WhatsApp Aktif *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                  <input
                    type="tel"
                    value={patientPhone}
                    onChange={(e) => setPatientPhone(e.target.value)}
                    placeholder="0812-3456-7890"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Email Pasien
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                  <input
                    type="email"
                    value={patientEmail}
                    onChange={(e) => setPatientEmail(e.target.value)}
                    placeholder="contoh: pasien@gmail.com"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Status Perkawinan *
                  </label>
                  <select
                    required
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value as UserProfile['maritalStatus'] | '')}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  >
                    <option value="">Pilih status</option>
                    <option value="Sudah menikah">Menikah</option>
                    <option value="Belum menikah">Belum Menikah</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-700 block mb-1">
                    Pekerjaan Pasien *
                  </label>
                  <input
                    type="text"
                    required
                    value={occupation}
                    onChange={(e) => setOccupation(e.target.value)}
                    placeholder="Mahasiswa, Guru, Wiraswasta"
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Catatan Tambahan (Opsional)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Tuliskan keluhan atau preferensi lainnya..."
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Ringkasan / DETAIL JADWAL */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="text-center pb-2">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                  Konfirmasi Booking
                </span>
                <h3 className="text-lg font-extrabold text-stone-900 mt-2">
                  DETAIL JADWAL TINDAKAN
                </h3>
                <p className="text-xs text-stone-500">
                  Harap periksa kembali rincian jadwal sebelum konfirmasi.
                </p>
              </div>

              <div className="bg-stone-50 rounded-2xl p-4 sm:p-5 border border-stone-200 space-y-3.5 text-xs sm:text-sm">
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Nama Pasien</span>
                  <span className="font-bold text-stone-900 text-right">{patientName}</span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Nomor Telepon</span>
                  <span className="font-bold text-stone-900 text-right">{patientPhone}</span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Pilihan Terapi</span>
                  <span className="font-bold text-emerald-800 text-right">
                    {selectedTherapy?.name} ({selectedTherapy?.durationText})
                  </span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Lokasi Tindakan</span>
                  <span className="font-semibold text-stone-900 text-right max-w-[65%]">
                    {selectedLocation?.name}
                  </span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Hari & Tanggal</span>
                  <span className="font-bold text-stone-900 text-right">
                    {getIndonesianDayName(selectedDate)}, {formatIndonesianDate(selectedDate)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-stone-200 pb-2">
                  <span className="text-stone-500">Jam Tindakan</span>
                  <span className="font-extrabold text-emerald-800 text-right bg-emerald-100 px-2 py-0.5 rounded">
                    {selectedTimeSlot.includes('WIB') ? selectedTimeSlot : `${selectedTimeSlot} WIB`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Jadwal Berhasil Dibuat */}
          {step === 6 && createdAppointment && (
            <div className="text-center py-4 space-y-4 animate-fadeIn">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-10 h-10" />
              </div>

              <div>
                <h3 className="text-xl font-extrabold text-stone-900">
                  Jadwal Berhasil Dibuat!
                </h3>
                <p className="text-xs text-emerald-800 font-medium mt-1">
                  Jadwal berhasil dicatat dan menunggu konfirmasi dari tenaga kesehatan.
                </p>
              </div>

              {registrationSyncStatus !== 'idle' && (
                <p
                  role="status"
                  className={`rounded-xl px-3 py-2 text-xs ${
                    registrationSyncStatus === 'failed'
                      ? 'bg-amber-50 text-amber-800'
                      : 'bg-stone-100 text-stone-600'
                  }`}
                >
                  {registrationSyncStatus === 'sending' &&
                    'Mengirim data pendaftaran minimal ke spreadsheet...'}
                  {registrationSyncStatus === 'sent-unverified' &&
                    'Permintaan pengiriman terkirim, tetapi spreadsheet tidak mengirim konfirmasi yang dapat dibaca aplikasi.'}
                  {registrationSyncStatus === 'failed' &&
                    'Data pendaftaran gagal dikirim ke spreadsheet. Jadwal tetap tersimpan; silakan minta admin memeriksa endpoint.'}
                </p>
              )}

              {/* Booking Card */}
              <div className="bg-gradient-to-br from-emerald-900 to-teal-950 text-white rounded-3xl p-5 shadow-xl text-left relative overflow-hidden">
                <div className="flex justify-between items-start border-b border-emerald-800/80 pb-3 mb-3">
                  <div>
                    <span className="text-[10px] text-emerald-300 font-semibold tracking-wider uppercase">
                      Kode Booking
                    </span>
                    <p className="text-xl font-black text-amber-300 tracking-wider">
                      {createdAppointment.bookingCode}
                    </p>
                  </div>
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-emerald-200">
                    <QrCode className="w-6 h-6" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-emerald-300 text-[10px] block">Terapi</span>
                    <span className="font-bold text-white text-sm">{createdAppointment.therapyName}</span>
                  </div>
                  <div>
                    <span className="text-emerald-300 text-[10px] block">Waktu</span>
                    <span className="font-bold text-white text-sm">
                      {createdAppointment.dayName}, {createdAppointment.timeSlot.includes('WIB') ? createdAppointment.timeSlot : `${createdAppointment.timeSlot} WIB`}
                    </span>
                  </div>
                  <div className="col-span-2 pt-1">
                    <span className="text-emerald-300 text-[10px] block">Lokasi</span>
                    <span className="font-medium text-stone-200 text-xs">
                      {createdAppointment.locationName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    onClose();
                    onGoToMyAppointments();
                  }}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-3 px-4 rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2 shadow-md"
                >
                  <CalendarCheck2 className="w-4 h-4" />
                  <span>Buka Halaman Jadwal Saya</span>
                </button>

                <button
                  onClick={onClose}
                  className="w-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer"
                >
                  Selesai & Kembali ke Beranda
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        {step <= 5 && (
          <div className="p-4 sm:p-5 border-t border-stone-100 bg-stone-50 rounded-b-3xl flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setStep(step - 1);
                }}
                className="flex items-center gap-1.5 text-stone-600 hover:text-stone-900 text-xs sm:text-sm font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Kembali</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="text-stone-500 hover:text-stone-700 text-xs sm:text-sm font-medium px-3 py-2 cursor-pointer"
              >
                Batal
              </button>
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold px-5 py-2.5 rounded-xl shadow-md shadow-emerald-700/20 flex items-center gap-2 transition cursor-pointer"
              >
                <span>Lanjutkan</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmBooking}
                className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-extrabold px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-700/25 flex items-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Konfirmasi Jadwal</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
