import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  Clock,
  MapPin,
  CalendarPlus,
  QrCode,
  AlertCircle,
  CheckCircle2,
  CalendarX2,
  ChevronRight,
  Eye,
  Filter,
  User,
  Users,
  ClipboardList,
  HeartPulse,
  Activity,
  FileText,
  Stethoscope,
  X,
  Printer
} from 'lucide-react';
import { Appointment, AppointmentStatus, UserProfile, ClinicalProgressNote } from '../types';
import { formatIndonesianDate, filterUserAppointments, filterProgressNotesForUser } from '../utils/storage';

interface MyAppointmentsViewProps {
  appointments: Appointment[];
  currentUser: UserProfile;
  progressNotes?: ClinicalProgressNote[];
  onOpenBooking: () => void;
  onViewDetail: (appointment: Appointment) => void;
  onCancelAppointment: (id: string, reason: string) => void;
  onOpenPatientAuth?: () => void;
}

export const MyAppointmentsView: React.FC<MyAppointmentsViewProps> = ({
  appointments,
  currentUser,
  progressNotes = [],
  onOpenBooking,
  onViewDetail,
  onCancelAppointment,
  onOpenPatientAuth
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'appointments' | 'progressNotes'>('appointments');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');
  const [selectedNoteForModal, setSelectedNoteForModal] = useState<ClinicalProgressNote | null>(null);

  const statusFilters = ['Semua', 'Terjadwal', 'Menunggu', 'Selesai', 'Dibatalkan'];

  // Scope appointments strictly to current active patient
  const userScopedAppointments = useMemo(() => {
    return filterUserAppointments(appointments, currentUser);
  }, [appointments, currentUser]);

  const filteredAppointments = useMemo(() => {
    return userScopedAppointments.filter((app) => {
      if (selectedStatus === 'Semua') return true;
      return app.status === selectedStatus;
    });
  }, [userScopedAppointments, selectedStatus]);

  // Synchronized clinical progress notes from Nakes for this active patient
  const userProgressNotes = useMemo(() => {
    return filterProgressNotesForUser(progressNotes, currentUser, userScopedAppointments);
  }, [progressNotes, currentUser, userScopedAppointments]);

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case 'Terjadwal':
        return (
          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
            Terjadwal
          </span>
        );
      case 'Menunggu':
        return (
          <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
            Menunggu
          </span>
        );
      case 'Selesai':
        return (
          <span className="bg-blue-100 text-blue-800 border border-blue-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
            Selesai
          </span>
        );
      case 'Dibatalkan':
        return (
          <span className="bg-stone-100 text-stone-600 border border-stone-300 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
            Dibatalkan
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 pb-12 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-6 sm:p-8 rounded-3xl shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 bg-emerald-800/80 px-3 py-1 rounded-full border border-emerald-600/50">
            Jadwal Saya & Riwayat Medis
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight mt-2">
            Riwayat & Reservasi Terapi
          </h1>
          <p className="text-xs sm:text-sm text-emerald-100 mt-1 font-light">
            Kelola jadwal tindakan keperawatan holistik, pantau status reservasi, dan evaluasi rekam medis dari perawat.
          </p>
        </div>
        <button
          onClick={onOpenBooking}
          className="bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-bold px-5 py-2.5 rounded-2xl shadow-md transition flex items-center gap-2 text-xs sm:text-sm shrink-0 cursor-pointer"
        >
          <CalendarPlus className="w-4 h-4" />
          <span>Tambah Jadwal</span>
        </button>
      </div>

      {/* Patient Profile Scope Box */}
      <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-stone-900">{currentUser.name}</span>
              <span className="text-[10px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {currentUser.patientNumber}
              </span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5">
              Email: {currentUser.email || '-'} • Reservasi: {userScopedAppointments.length} jadwal • Catatan Perawat: {userProgressNotes.length} rekam medis
            </p>
          </div>
        </div>

        {onOpenPatientAuth && (
          <button
            onClick={onOpenPatientAuth}
            className="w-full sm:w-auto bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 font-bold px-3.5 py-2 rounded-xl border border-stone-200 transition cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Ganti / Masuk Akun Pasien</span>
          </button>
        )}
      </div>

      {/* Primary Sub-Tabs: Jadwal Tindakan vs Rekam Medis Nakes */}
      <div className="flex items-center gap-2 border-b border-stone-200">
        <button
          onClick={() => setActiveSubTab('appointments')}
          className={`px-4 py-2.5 font-bold text-xs sm:text-sm rounded-t-2xl transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'appointments'
              ? 'bg-white text-emerald-900 border-t-2 border-emerald-600 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <CalendarClock className="w-4 h-4 text-emerald-700" />
          <span>Jadwal Reservasi ({userScopedAppointments.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('progressNotes')}
          className={`px-4 py-2.5 font-bold text-xs sm:text-sm rounded-t-2xl transition cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'progressNotes'
              ? 'bg-white text-emerald-900 border-t-2 border-emerald-600 shadow-xs'
              : 'text-stone-500 hover:text-stone-800'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-emerald-700" />
          <span>Catatan Perkembangan Nakes ({userProgressNotes.length})</span>
          {userProgressNotes.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          )}
        </button>
      </div>

      {/* VIEW 1: JADWAL RESERVASI */}
      {activeSubTab === 'appointments' && (
        <div className="space-y-4">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {statusFilters.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                  selectedStatus === st
                    ? 'bg-emerald-800 text-white shadow-md'
                    : 'bg-white text-stone-600 hover:bg-emerald-50 border border-stone-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Appointment Cards List */}
          <div className="space-y-4">
            {filteredAppointments.map((app) => {
              const matchedNote = userProgressNotes.find(
                (n) => n.bookingCode === app.bookingCode || n.appointmentId === app.id
              );

              return (
                <div
                  key={app.id}
                  className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="text-xs font-mono font-bold text-stone-500 bg-stone-100 px-2.5 py-0.5 rounded-lg border border-stone-200">
                        {app.bookingCode}
                      </span>
                      {getStatusBadge(app.status)}

                      {matchedNote && (
                        <button
                          onClick={() => setSelectedNoteForModal(matchedNote)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 transition cursor-pointer"
                          title="Klik untuk membaca evaluasi tindakan dari perawat"
                        >
                          <ClipboardList className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Catatan Perawat Tersedia</span>
                        </button>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-black text-stone-900">
                        {app.therapyName}
                      </h3>
                      <p className="text-xs text-stone-600 flex items-center gap-1.5 mt-0.5">
                        <span className="font-semibold text-emerald-800">{app.dayName}, {formatIndonesianDate(app.date)}</span>
                        <span>•</span>
                        <span className="bg-emerald-50 text-emerald-900 font-bold px-1.5 py-0.2 rounded">
                          {app.timeSlot.includes('WIB') ? app.timeSlot : `${app.timeSlot} WIB`}
                        </span>
                      </p>
                    </div>

                    <p className="text-xs text-stone-500 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                      <span className="truncate max-w-md">{app.locationName}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-stone-100 flex-wrap">
                    {matchedNote && (
                      <button
                        onClick={() => setSelectedNoteForModal(matchedNote)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 px-3.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                      >
                        <Stethoscope className="w-3.5 h-3.5" />
                        <span>Rekam Medis Nakes</span>
                      </button>
                    )}

                    <button
                      onClick={() => onViewDetail(app)}
                      className="bg-stone-100 hover:bg-emerald-50 hover:text-emerald-800 text-stone-700 text-xs font-bold py-2.5 px-4 rounded-xl border border-stone-200 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Lihat Detail</span>
                    </button>

                    {app.status !== 'Dibatalkan' && app.status !== 'Selesai' && (
                      <button
                        onClick={() => onViewDetail(app)}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold py-2.5 px-3 rounded-xl transition cursor-pointer"
                      >
                        Batalkan
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {filteredAppointments.length === 0 && (
              <div className="text-center py-16 bg-white rounded-3xl border border-stone-200 p-6 space-y-3">
                <div className="w-14 h-14 bg-stone-100 text-stone-400 rounded-full flex items-center justify-center mx-auto">
                  <CalendarX2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="font-bold text-stone-800 text-base">Belum Ada Jadwal</h3>
                  <p className="text-xs text-stone-500 mt-1 max-w-sm mx-auto">
                    Pasien <strong>{currentUser.name}</strong> belum memiliki reservasi dengan status "{selectedStatus}".
                  </p>
                </div>
                <button
                  onClick={onOpenBooking}
                  className="mt-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4" />
                  <span>Buat Jadwal Baru</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: CATATAN PERKEMBANGAN DARI PERAWAT */}
      {activeSubTab === 'progressNotes' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-emerald-700" />
                <span>Dokumentasi Asuhan & Rekam Medis Pasien</span>
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Evaluasi tindakan, tanda vital, dan respon terapi yang dicatat langsung oleh tenaga perawat penanggung jawab.
              </p>
            </div>
            <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse"></span>
              Tersinkronisasi Real-Time
            </span>
          </div>

          {userProgressNotes.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-stone-100 text-stone-400 flex items-center justify-center mx-auto">
                <ClipboardList className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-stone-800 text-sm">Belum Ada Catatan Klinis Tersimpan</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                Setelah Anda menyelesaikan sesi terapi, perawat akan mendokumentasikan hasil pengkajian fisik, respon terapi, dan instruksi perawatan mandiri di rumah.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {userProgressNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteForModal(note)}
                  className="bg-white rounded-2xl border border-stone-200 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition-all space-y-3 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-2.5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-stone-900 text-sm">{note.therapyName}</span>
                        {note.bookingCode && (
                          <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            {note.bookingCode}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                          {note.patientNumber}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500 mt-1">
                        Tanggal Tindakan: <strong>{formatIndonesianDate(note.visitDate)}</strong>
                      </p>
                    </div>

                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xl flex items-center gap-1 shrink-0">
                      <span>Buka Rekam Medis</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>

                  {note.vitalSigns && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-stone-50 p-2.5 rounded-xl border border-stone-200/60">
                      <div>
                        <span className="text-[10px] text-stone-400 block font-semibold">Tekanan Darah:</span>
                        <span className="font-bold text-stone-800">{note.vitalSigns.bloodPressure || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 block font-semibold">Nadi:</span>
                        <span className="font-bold text-stone-800">{note.vitalSigns.pulseRate || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 block font-semibold">Pernapasan:</span>
                        <span className="font-bold text-stone-800">{note.vitalSigns.respiratoryRate || '-'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-stone-400 block font-semibold">Skala Nyeri:</span>
                        <span className="font-bold text-emerald-700">{note.vitalSigns.painScale !== undefined ? `${note.vitalSigns.painScale} / 10` : '-'}</span>
                      </div>
                    </div>
                  )}

                  <div className="text-xs text-stone-700 space-y-1">
                    <p className="line-clamp-2">
                      <strong className="text-stone-900">Keluhan:</strong> {note.chiefComplaint}
                    </p>
                    <p className="line-clamp-2 text-stone-600">
                      <strong className="text-stone-900">Tindak Lanjut & Anjuran Nakes:</strong> {note.progressFollowUp}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
                    <span>Perawat: <strong className="text-stone-800">{note.nurseName}</strong></span>
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Tervalidasi
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL DETAIL REKAM MEDIS DARI PERAWAT */}
      {selectedNoteForModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3.5 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-scaleUp border border-stone-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-base">Rekam Asuhan Keperawatan</h3>
                  <p className="text-[11px] text-stone-500 font-mono">
                    {selectedNoteForModal.patientNumber} • {formatIndonesianDate(selectedNoteForModal.visitDate)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedNoteForModal(null)}
                className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Vital Signs Box */}
            {selectedNoteForModal.vitalSigns && (
              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 space-y-2">
                <h4 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                  <HeartPulse className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Pemeriksaan Tanda Vital (TTV)</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] text-stone-400 block font-semibold">Tekanan Darah</span>
                    <span className="font-bold text-stone-800">{selectedNoteForModal.vitalSigns.bloodPressure || '-'}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] text-stone-400 block font-semibold">Nadi</span>
                    <span className="font-bold text-stone-800">{selectedNoteForModal.vitalSigns.pulseRate || '-'}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] text-stone-400 block font-semibold">Pernapasan</span>
                    <span className="font-bold text-stone-800">{selectedNoteForModal.vitalSigns.respiratoryRate || '-'}</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-emerald-100 shadow-2xs">
                    <span className="text-[10px] text-stone-400 block font-semibold">Skala Nyeri</span>
                    <span className="font-bold text-emerald-700">{selectedNoteForModal.vitalSigns.painScale !== undefined ? `${selectedNoteForModal.vitalSigns.painScale} / 10` : '-'}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Keluhan Saat Kunjungan:</span>
                <p className="text-stone-700 whitespace-pre-wrap">{selectedNoteForModal.chiefComplaint}</p>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Hasil Pengkajian Klinis (Asesmen):</span>
                <p className="text-stone-700 whitespace-pre-wrap">{selectedNoteForModal.assessment}</p>
              </div>

              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
                <span className="font-bold text-stone-900 block mb-1">Intervensi & Modalitas yang Diberikan:</span>
                <p className="text-stone-700 whitespace-pre-wrap">{selectedNoteForModal.intervention}</p>
              </div>

              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-200">
                <span className="font-bold text-emerald-950 block mb-1">Catatan Perkembangan & Tindak Lanjut:</span>
                <p className="text-emerald-900 whitespace-pre-wrap">{selectedNoteForModal.progressFollowUp}</p>
              </div>
            </div>

            <div className="pt-3 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
              <div>
                <span>Perawat:</span>
                <p className="font-bold text-stone-900">{selectedNoteForModal.nurseName}</p>
              </div>
              <button
                onClick={() => window.print()}
                className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold px-3 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Rekam</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

