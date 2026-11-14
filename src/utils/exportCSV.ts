import { Appointment } from '../types';
import { formatIndonesianDate } from './storage';

/**
 * Helper untuk mengekspor data janji temu ke format CSV
 * Mengikuti spesifikasi RFC 4180 dengan UTF-8 BOM untuk kompatibilitas penuh dengan Microsoft Excel & Google Sheets.
 */
export const exportAppointmentsToCSV = (
  appointments: Appointment[],
  customFilename?: string
): boolean => {
  if (!appointments || appointments.length === 0) {
    return false;
  }

  // Kolom Header CSV
  const headers = [
    'No',
    'Kode Booking',
    'No Rekam Medis (RM)',
    'Nama Pasien',
    'No HP / WhatsApp',
    'Email Pasien',
    'Jenis Terapi',
    'Lokasi Tindakan',
    'Hari Tindakan',
    'Tanggal Tindakan',
    'Tanggal Format Lengkap',
    'Jam Tindakan',
    'Status Jadwal',
    'Catatan / Keluhan Pasien',
    'Alasan Pembatalan',
    'Waktu Pendaftaran'
  ];

  // Helper escape untuk CSV sesuai RFC 4180
  const escapeCSV = (value: unknown): string => {
    if (value === null || value === undefined) return '""';
    const str = String(value).trim();
    // Escape quote ganda
    return `"${str.replace(/"/g, '""')}"`;
  };

  // Baris Data
  const rows = appointments.map((app, index) => {
    const timeFormatted = app.timeSlot
      ? app.timeSlot.includes('WIB')
        ? app.timeSlot
        : `${app.timeSlot} WIB`
      : '-';

    const createdAtFormatted = app.createdAt
      ? new Date(app.createdAt).toLocaleString('id-ID', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }) + ' WIB'
      : '-';

    return [
      escapeCSV(index + 1),
      escapeCSV(app.bookingCode || '-'),
      escapeCSV(app.patientNumber || '-'),
      escapeCSV(app.userName || '-'),
      escapeCSV(app.userPhone || '-'),
      escapeCSV(app.userEmail || '-'),
      escapeCSV(app.therapyName || '-'),
      escapeCSV(app.locationName || '-'),
      escapeCSV(app.dayName || '-'),
      escapeCSV(app.date || '-'),
      escapeCSV(app.date ? formatIndonesianDate(app.date) : '-'),
      escapeCSV(timeFormatted),
      escapeCSV(app.status || 'Terjadwal'),
      escapeCSV(app.notes || '-'),
      escapeCSV(app.cancelledReason || '-'),
      escapeCSV(createdAtFormatted)
    ].join(',');
  });

  // Gabungkan dengan \uFEFF (UTF-8 BOM) agar karakter Indonesia terbaca sempurna di Excel Windows/Mac
  const csvContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');

  // Trigger download di browser
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const downloadAnchor = document.createElement('a');

  const todayStr = new Date().toISOString().split('T')[0];
  const filename = customFilename || `Data_Jadwal_Holistic_Nursing_${todayStr}.csv`;

  downloadAnchor.setAttribute('href', url);
  downloadAnchor.setAttribute('download', filename);
  downloadAnchor.style.display = 'none';

  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
  URL.revokeObjectURL(url);

  return true;
};
