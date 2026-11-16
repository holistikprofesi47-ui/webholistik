import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, LockKeyhole, Save, X } from 'lucide-react';
import { Appointment, NurseClinicalRecord, UserProfile } from '../types';
import { auth } from '../services/firebaseAuth';
import {
  getNurseClinicalRecordsPage,
  saveNurseClinicalRecord,
  subscribeNurseClinicalRecords
} from '../services/firebaseFirestore';
import { getAgeParts, getPatientDisplayName } from '../utils/patientDemographics';

interface PatientClinicalProfileModalProps {
  profile: Partial<UserProfile>;
  appointment: Appointment | null;
  onClose: () => void;
}

const PatientClinicalProfileModal: React.FC<PatientClinicalProfileModalProps> = ({
  profile,
  appointment,
  onClose
}) => {
  const [records, setRecords] = useState<NurseClinicalRecord[]>([]);
  const [recordsPageInfo, setRecordsPageInfo] = useState({ cursor: null as string | null, hasMore: false });
  const [isLoadingMoreRecords, setIsLoadingMoreRecords] = useState(false);
  const [soap, setSoap] = useState({ subjective: '', objective: '', assessment: '', plan: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [notice, setNotice] = useState('');
  const recordPageIdsRef = useRef(new Set<string>());
  const hasRecordSnapshotRef = useRef(false);
  const hasLoadedMoreRecordsRef = useRef(false);

  const patientId =
    appointment?.userId || profile.id || appointment?.patientNumber || profile.patientNumber || '';
  const patientName = appointment?.userName || profile.name || 'Pasien';
  const patientNumber = appointment?.patientNumber || profile.patientNumber || '';
  const nurseName = auth.currentUser?.displayName || auth.currentUser?.email || 'Perawat Penanggung Jawab / Ners';
  const hasFirebaseStaffSession = Boolean(auth.currentUser && !auth.currentUser.isAnonymous);
  const age = useMemo(
    () => (profile.dateOfBirth ? getAgeParts(profile.dateOfBirth) : null),
    [profile.dateOfBirth]
  );

  useEffect(() => {
    if (!patientId) return;
    hasRecordSnapshotRef.current = false;
    hasLoadedMoreRecordsRef.current = false;
    recordPageIdsRef.current = new Set();
    setRecords([]);
    setRecordsPageInfo({ cursor: null, hasMore: false });
    return subscribeNurseClinicalRecords(
      patientId,
      (remoteRecords, pageInfo) => {
        if (!hasLoadedMoreRecordsRef.current) setRecordsPageInfo(pageInfo);
        const newPageIds = new Set(remoteRecords.map((record) => record.id));
        if (!hasRecordSnapshotRef.current) {
          hasRecordSnapshotRef.current = true;
          recordPageIdsRef.current = newPageIds;
          setRecords(remoteRecords);
          return;
        }

        const previousPageIds = recordPageIdsRef.current;
        recordPageIdsRef.current = newPageIds;
        setRecords((current) => {
          const retainedPages = current.filter(
            (record) => !previousPageIds.has(record.id) && !newPageIds.has(record.id)
          );
          return [...retainedPages, ...remoteRecords].sort(
            (a, b) => b.createdAt.localeCompare(a.createdAt)
          );
        });
      },
      (error) => setErrorMessage(`Rekam medis perawat tidak dapat dimuat: ${error.message}`)
    );
  }, [patientId]);

  const handleLoadMoreRecords = async () => {
    if (isLoadingMoreRecords || !recordsPageInfo.hasMore || !recordsPageInfo.cursor) return;
    setIsLoadingMoreRecords(true);
    try {
      const page = await getNurseClinicalRecordsPage(patientId, recordsPageInfo.cursor);
      hasLoadedMoreRecordsRef.current = true;
      setRecords((current) => {
        const byId = new Map(current.map((record) => [record.id, record]));
        page.items.forEach((record) => byId.set(record.id, record));
        return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });
      setRecordsPageInfo({ cursor: page.cursor, hasMore: page.hasMore });
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? `Riwayat SOAP tidak dapat dimuat: ${error.message}` : 'Riwayat SOAP tidak dapat dimuat.'
      );
    } finally {
      setIsLoadingMoreRecords(false);
    }
  };

  const handleSaveSoap = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientId) {
      setErrorMessage('Identitas pasien tidak lengkap; catatan tidak dapat disimpan.');
      return;
    }

    setErrorMessage('');
    setNotice('');
    setIsSaving(true);
    try {
      await saveNurseClinicalRecord({
        patientId,
        patientName,
        patientNumber,
        appointmentId: appointment?.id,
        ...soap,
        nurseName,
        profession: 'Perawat Penanggung Jawab / Ners',
        createdAt: new Date().toISOString()
      });
      setSoap({ subjective: '', objective: '', assessment: '', plan: '' });
      setNotice('Catatan SOAP tersimpan di rekam medis perawat yang bersifat rahasia.');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Catatan tidak tersimpan. Pastikan akun Nakes berwenang: ${error.message}`
          : 'Catatan tidak tersimpan. Pastikan akun Nakes berwenang.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const identity = [
    ['Tanggal lahir', profile.dateOfBirth || '-'],
    ['Usia', age ? `${age.years} tahun` : '-'],
    ['No. RM', patientNumber || '-'],
    ['Jenis kelamin', profile.gender || appointment?.gender || '-'],
    ['Status perkawinan', profile.maritalStatus || appointment?.maritalStatus || '-'],
    ['Pekerjaan', profile.occupation || appointment?.occupation || '-']
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/70 p-3 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-clinical-profile-title"
        className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-stone-200 bg-white p-5 shadow-2xl sm:p-7"
      >
        <header className="mb-5 flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
              <LockKeyhole className="h-3 w-3" />
              Rekam medis rahasia - khusus Nakes
            </div>
            <h2 id="patient-clinical-profile-title" className="text-lg font-extrabold text-stone-900">
              Profil & Rekam Medis Pasien
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              {getPatientDisplayName(patientName, profile)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup profil pasien" className="rounded-xl p-2 text-stone-500 hover:bg-stone-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="mb-5 grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {identity.map(([label, value]) => (
            <div key={label}>
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400">{label}</span>
              <span className="text-xs font-bold text-stone-800">{value}</span>
            </div>
          ))}
        </div>

        {!hasFirebaseStaffSession && (
          <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            Untuk mengisi rekam medis rahasia, masuk menggunakan Google dengan akun Nakes yang telah diotorisasi di Firestore. Login kode sandi lokal saja tidak memberikan izin database.
          </p>
        )}

        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Riwayat SOAP Perawat</h3>
              <p className="mt-0.5 text-[11px] text-stone-500">Pemeriksaan: {new Date().toLocaleString('id-ID')} · Perawat Penanggung Jawab / Ners</p>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-bold text-stone-600">{records.length} catatan</span>
          </div>
          {records.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 p-4 text-center text-xs text-stone-500">
              Belum ada catatan SOAP perawat untuk pasien ini.
            </p>
          ) : (
            <div className="max-h-52 space-y-2 overflow-y-auto">
              {records.map((record) => (
                <article key={record.id} className="rounded-xl border border-stone-200 p-3 text-xs">
                  <p className="mb-2 font-semibold text-stone-500">
                    {new Date(record.createdAt).toLocaleString('id-ID')} · {record.nurseName}
                  </p>
                  {([
                    ['S', 'Subjective', record.subjective],
                    ['O', 'Objective', record.objective],
                    ['A', 'Assessment', record.assessment],
                    ['P', 'Plan', record.plan]
                  ] as const).map(([initial, title, text]) => (
                    <p key={initial} className="mb-1 whitespace-pre-wrap text-stone-700">
                      <strong>{initial} · {title}:</strong> {text}
                    </p>
                  ))}
                </article>
              ))}
            </div>
          )}
          {recordsPageInfo.hasMore && (
            <button
              type="button"
              onClick={handleLoadMoreRecords}
              disabled={isLoadingMoreRecords}
              className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:cursor-wait disabled:opacity-60"
            >
              {isLoadingMoreRecords ? 'Memuat riwayat...' : 'Muat riwayat SOAP berikutnya'}
            </button>
          )}
        </section>

        <form onSubmit={handleSaveSoap} className="space-y-3">
          <h3 className="text-sm font-bold text-stone-900">Catatan Klinis Baru (SOAP)</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              ['subjective', 'S - Subjective', 'Keluhan dan informasi subjektif pasien'],
              ['objective', 'O - Objective', 'Temuan objektif dan tanda vital'],
              ['assessment', 'A - Assessment', 'Analisis atau penilaian klinis'],
              ['plan', 'P - Plan', 'Rencana tindakan dan edukasi']
            ] as const).map(([key, label, placeholder]) => (
              <label key={key} className="text-xs font-bold text-stone-700">
                {label}
                <textarea
                  required
                  rows={3}
                  value={soap[key]}
                  onChange={(event) => setSoap((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={placeholder}
                  className="mt-1 w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-3 font-normal focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </label>
            ))}
          </div>

          {(errorMessage || notice) && (
            <p className={`flex items-start gap-2 rounded-xl p-3 text-xs ${errorMessage ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
              {errorMessage ? <AlertCircle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
              {errorMessage || notice}
            </p>
          )}

          <footer className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-xl bg-stone-100 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-200">
              Tutup
            </button>
            <button type="submit" disabled={isSaving || !hasFirebaseStaffSession} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60">
              <Save className="h-4 w-4" />
              {isSaving ? 'Menyimpan...' : 'Simpan SOAP Rahasia'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export default PatientClinicalProfileModal;
