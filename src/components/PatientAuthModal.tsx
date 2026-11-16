import React, { useState } from 'react';
import { X, Mail, Lock, User, Phone, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { generatePatientNumber, saveRegisteredPatient, getRegisteredPatients } from '../utils/storage';
import {
  saveUserProfileToFirestore,
  saveRegistrationToFirestore,
  getUserProfileByIdentifier,
  getUserProfileFromFirestore
} from '../services/firebaseFirestore';
import { saveUserProfileToRTDB } from '../services/firebaseRealtime';
import { registerWithEmailPassword, loginWithEmailPassword } from '../services/firebaseAuth';
import { UserProfile } from '../types';
import { formatAge, getAgeParts, getLocalDateInputValue } from '../utils/patientDemographics';

interface PatientAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (patientData: UserProfile) => void;
  onPatientAuthSuccess?: (patientData: UserProfile) => void;
  currentUser?: any;
  onGoogleAuthSuccess?: (user: any, token: string) => void;
  onLogout?: () => void;
  authPromptReason?: string | null;
}

export const PatientAuthModal: React.FC<PatientAuthModalProps> = (props) => {
  const { isOpen, onClose, onSuccess, onPatientAuthSuccess, authPromptReason } = props;

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState(''); // Email, No. RM, atau No. HP
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<UserProfile['gender'] | ''>('');
  const [maritalStatus, setMaritalStatus] = useState<UserProfile['maritalStatus'] | ''>('');
  const [occupation, setOccupation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
    setIdentifier('');
    setPassword('');
    setName('');
    setPhone('');
    setDateOfBirth('');
    setGender('');
    setMaritalStatus('');
    setOccupation('');
    setError('');
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const currentRegistrationAge = getAgeParts(dateOfBirth);

  const safeSuccess = (data: UserProfile) => {
    if (typeof onSuccess === 'function') {
      onSuccess(data);
    } else if (typeof onPatientAuthSuccess === 'function') {
      onPatientAuthSuccess(data);
    } else if (typeof (props as any).onAuthSuccess === 'function') {
      (props as any).onAuthSuccess(data);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanInput = identifier.trim().toLowerCase();

    if (activeTab === 'login') {
      // 1. Verifikasi Akun via Firebase Auth & Firestore / LocalStorage
      try {
        let firebaseAuthUser: any = null;
        if (cleanInput.includes('@') && password) {
          try {
            firebaseAuthUser = await loginWithEmailPassword(cleanInput, password);
          } catch (authErr: any) {
            console.warn('Firebase email/password login notice:', authErr?.message);
          }
        }

        let foundPatient: any = firebaseAuthUser
          ? await getUserProfileFromFirestore(firebaseAuthUser.uid)
          : null;
        const registeredList = getRegisteredPatients();
        const localMatch = registeredList.find(
          (p) =>
            (p.email && p.email.toLowerCase() === cleanInput) ||
            (p.patientNumber && p.patientNumber.toLowerCase() === cleanInput) ||
            (p.phone && p.phone.replace(/\D/g, '') === cleanInput.replace(/\D/g, ''))
        );

        if (!foundPatient && localMatch) {
          foundPatient = localMatch;
        } else if (!foundPatient) {
          // Cari hanya berdasarkan identifier agar tidak mengunduh seluruh koleksi profil.
          try {
            foundPatient = await getUserProfileByIdentifier(identifier);
          } catch (fsErr) {
            console.warn('Firestore user fetch notice:', fsErr);
          }
        }

        // Jika berhasil login via Firebase Auth tapi belum tersimpan di list lokal
        if (!foundPatient && firebaseAuthUser) {
          foundPatient = {
            id: firebaseAuthUser.uid,
            name: firebaseAuthUser.displayName || 'Pasien',
            email: firebaseAuthUser.email || cleanInput,
            phone: phone || '',
            patientNumber: generatePatientNumber(),
            address: 'Semarang',
            emergencyContact: '-',
            medicalNotes: '',
            joinedDate: new Date().toISOString().split('T')[0],
            isGuest: false
          };
        }

        if (!foundPatient) {
          setError('Akun tidak ditemukan. Silakan periksa kembali email / nomor RM / nomor HP, atau klik "Daftar Baru".');
          setLoading(false);
          return;
        }

        // Verifikasi password jika akun memiliki password lokal dan bukan login Firebase Auth langsung
        if (!firebaseAuthUser && foundPatient.password && foundPatient.password !== password) {
          setError('Kata sandi salah. Silakan coba lagi.');
          setLoading(false);
          return;
        }

        const patientProfile: UserProfile = {
          id: foundPatient.id ? String(foundPatient.id) : `pat-${Date.now()}`,
          name: foundPatient.name || 'Pasien Terdaftar',
          email: foundPatient.email || (cleanInput.includes('@') ? cleanInput : ''),
          phone: foundPatient.phone || foundPatient.no_hp || phone || '',
          dateOfBirth: foundPatient.dateOfBirth || foundPatient.birthDate || '',
          gender: foundPatient.gender,
          maritalStatus: foundPatient.maritalStatus,
          occupation: foundPatient.occupation || '',
          patientNumber: foundPatient.no_rm || foundPatient.patientNumber || generatePatientNumber(),
          address: foundPatient.address || foundPatient.alamat || 'Semarang',
          emergencyContact: foundPatient.emergencyContact || foundPatient.emergency_contact || '-',
          medicalNotes: foundPatient.medicalNotes || foundPatient.medical_notes || '',
          joinedDate: foundPatient.created_at ? foundPatient.created_at.split('T')[0] : (foundPatient.joinedDate || new Date().toISOString().split('T')[0]),
          isGuest: false
        };

        // Simpan ke Firestore & LocalStorage secara sinkron
        saveRegisteredPatient(patientProfile);
        try {
          await saveUserProfileToFirestore(patientProfile);
        } catch (fsErr) {
          console.warn('Firestore user profile sync notice:', fsErr);
        }

        setLoading(false);
        safeSuccess(patientProfile);
        handleClose();
      } catch (err: any) {
        console.error('CATCH LOGIN ERROR:', err);
        setError('Gagal menghubungkan ke database. Silakan coba sesaat lagi.');
        setLoading(false);
      }

    } else if (activeTab === 'register') {
      // 2. Registrasi Akun Baru ke Firebase Auth, Firestore & LocalStorage
      try {
        const cleanEmail = identifier.trim().toLowerCase();
        if (!cleanEmail.includes('@')) {
          setError('Mohon masukkan alamat email yang valid untuk pendaftaran.');
          setLoading(false);
          return;
        }

        const registrationAge = getAgeParts(dateOfBirth);
        if (!registrationAge) {
          setError('Mohon pilih tanggal lahir yang valid dan tidak melewati hari ini.');
          setLoading(false);
          return;
        }
        if (!gender) {
          setError('Mohon pilih jenis kelamin pasien.');
          setLoading(false);
          return;
        }
        if (!maritalStatus) {
          setError('Mohon pilih status pernikahan pasien.');
          setLoading(false);
          return;
        }
        if (!occupation.trim()) {
          setError('Mohon isi pekerjaan pasien.');
          setLoading(false);
          return;
        }

        // Cek dulu apakah email sudah dipakai di daftar pasien
        const registeredList = getRegisteredPatients();
        const existing = registeredList.find((p) => p.email && p.email.toLowerCase() === cleanEmail);
        if (existing) {
          setError('Email sudah terdaftar. Silakan pilih tab "Masuk".');
          setLoading(false);
          return;
        }

        // 1. Buat akun di Firebase Auth (createUserWithEmailAndPassword)
        let firebaseUid = '';
        try {
          const userCredential = await registerWithEmailPassword(cleanEmail, password);
          firebaseUid = userCredential.uid;
        } catch (authErr: any) {
          console.warn('Firebase Auth create user notice:', authErr?.message);
          if (authErr?.code === 'auth/email-already-in-use') {
            setError('Email sudah terdaftar. Silakan pilih tab "Masuk".');
            setLoading(false);
            return;
          }
        }

        const newId = firebaseUid || 'pat-' + Date.now();
        const generatedRM = generatePatientNumber();
        const cleanPhone = phone.trim();

        const patientProfile: UserProfile = {
          id: newId,
          name: name.trim(),
          email: cleanEmail,
          phone: cleanPhone,
          dateOfBirth,
          gender,
          maritalStatus,
          occupation: occupation.trim(),
          patientNumber: generatedRM,
          address: 'Semarang',
          emergencyContact: '-',
          medicalNotes: 'Pasien baru terdaftar secara online',
          joinedDate: new Date().toISOString().split('T')[0],
          isGuest: false
        };

        // Simpan data pendaftaran dan profil secara lengkap ke Firebase sebelum mengonfirmasi.
        await saveRegistrationToFirestore({
          id: newId,
          patientName: patientProfile.name,
          patientPhone: cleanPhone,
          email: cleanEmail,
          dateOfBirth,
          gender,
          maritalStatus: patientProfile.maritalStatus,
          occupation: patientProfile.occupation,
          attendanceStatus: 'Belum Hadir',
          createdAt: new Date().toISOString()
        });
        await saveUserProfileToFirestore(patientProfile);
        await saveUserProfileToRTDB(patientProfile);
        saveRegisteredPatient(patientProfile);

        setLoading(false);
        safeSuccess(patientProfile);
        handleClose();
      } catch (err: any) {
        console.error('CATCH REGISTER ERROR:', err);
        setError('Akun tidak dapat disimpan ke Firebase. Periksa koneksi, lalu coba kembali atau hubungi admin.');
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Navigation Tabs */}
        <div className="mb-6 flex border-b border-gray-200 text-sm font-medium">
          <button
            onClick={() => { setActiveTab('login'); setError(''); }}
            className={`flex-1 pb-3 text-center transition ${
              activeTab === 'login'
                ? 'border-b-2 border-emerald-600 font-bold text-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Masuk
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError(''); }}
            className={`flex-1 pb-3 text-center transition ${
              activeTab === 'register'
                ? 'border-b-2 border-emerald-600 font-bold text-emerald-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Daftar Baru
          </button>
        </div>

        {authPromptReason && (
          <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 border border-amber-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            <span>{authPromptReason}</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Login & Register */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === 'register' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Nama Lengkap Pasien *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Lengkap Sesuai KTP"
                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Nomor Telepon / WhatsApp *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="08xxxxxxxxxx"
                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Tanggal Lahir *</label>
                  <input
                    type="date"
                    required
                    max={getLocalDateInputValue()}
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Jenis Kelamin *</label>
                  <select
                    required
                    value={gender}
                    onChange={(e) => {
                      const value = e.target.value as UserProfile['gender'] | '';
                      setGender(value);
                    }}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Pilih jenis kelamin</option>
                    <option value="Laki-laki">Laki-laki</option>
                    <option value="Perempuan">Perempuan</option>
                  </select>
                </div>
              </div>

              {currentRegistrationAge && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700">Status Perkawinan *</label>
                  <select
                    required
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value as UserProfile['maritalStatus'] | '')}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Pilih status perkawinan</option>
                    <option value="Belum menikah">Belum menikah</option>
                    <option value="Sudah menikah">Sudah menikah</option>
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Pekerjaan Pasien *</label>
                <input
                  type="text"
                  required
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="Contoh: Mahasiswa, Guru, Wiraswasta"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Usia (otomatis)</label>
                <input
                  type="text"
                  readOnly
                  value={formatAge(getAgeParts(dateOfBirth)) || 'Usia dihitung dari tanggal lahir'}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-xs sm:text-sm text-gray-600"
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">
              {activeTab === 'login' ? 'Email, No. RM, atau No. HP Pasien *' : 'Alamat Email Pasien *'}
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type={activeTab === 'login' ? 'text' : 'email'}
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={activeTab === 'login' ? 'nama@email.com / RM-HNC-XXXX / 08xx' : 'nama@email.com'}
                className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            {activeTab === 'login' && (
              <p className="text-[11px] text-gray-400 mt-1">
                Bisa masuk menggunakan email terdaftar, nomor rekam medis (No. RM), atau nomor HP.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">Kata Sandi (Password) *</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-gray-300 py-2.5 pl-9 pr-4 text-xs sm:text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-700 py-3 text-xs sm:text-sm font-bold text-white transition hover:bg-emerald-800 disabled:opacity-50 cursor-pointer shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Memproses...</span>
            ) : activeTab === 'login' ? (
              <span>Masuk ke Akun Pasien</span>
            ) : (
              <span>Daftar & Buat Nomor Rekam Medis</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
