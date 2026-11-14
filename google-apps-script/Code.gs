const SHEET_NAME = 'Pendaftaran Pasien';
const HEADERS = [
  'Nama',
  'Jenis Kelamin',
  'No. RM',
  'Tanggal Kedatangan',
  'Jenis Terapi',
  'Status Terapi',
];
const ALLOWED_GENDERS = ['Laki-laki', 'Perempuan'];
const ALLOWED_STATUSES = ['Menunggu', 'Terjadwal', 'Selesai', 'Dibatalkan'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  let hasLock = false;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request body JSON tidak ditemukan.');
    }

    const data = JSON.parse(e.postData.contents);
    const registration = validateRegistration(data);

    lock.waitLock(10000);
    hasLock = true;

    const sheet = getRegistrationSheet();
    prepareSheet(sheet);
    sheet.appendRow([
      safeCellText(registration.nama),
      registration.jenisKelamin,
      safeCellText(registration.noRM),
      registration.tanggalKedatangan,
      safeCellText(registration.jenisTerapi),
      registration.statusTerapi,
    ]);

    return jsonResponse({ status: 'success' });
  } catch (error) {
    console.error('Pendaftaran pasien gagal disimpan:', error.message);
    return jsonResponse({
      status: 'error',
      message: error.message || 'Pendaftaran gagal disimpan.',
    });
  } finally {
    if (hasLock) {
      lock.releaseLock();
    }
  }
}

function doGet() {
  return jsonResponse({
    status: 'success',
    message: 'Endpoint pendaftaran pasien siap menerima data.',
  });
}

function validateRegistration(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Format data pendaftaran tidak valid.');
  }

  const nama = requiredText(data.nama, 'Nama', 200);
  const jenisKelamin = requiredText(data.jenisKelamin, 'Jenis Kelamin', 30);
  const noRM = requiredText(data.noRM, 'No. RM', 100);
  const jenisTerapi = requiredText(data.jenisTerapi, 'Jenis Terapi', 200);
  const statusTerapi = requiredText(data.statusTerapi, 'Status Terapi', 30);

  if (!ALLOWED_GENDERS.includes(jenisKelamin)) {
    throw new Error('Jenis kelamin harus Laki-laki atau Perempuan.');
  }

  if (!ALLOWED_STATUSES.includes(statusTerapi)) {
    throw new Error('Status terapi tidak dikenali.');
  }

  return {
    nama,
    jenisKelamin,
    noRM,
    tanggalKedatangan: parseIsoDate(data.tanggalKedatangan),
    jenisTerapi,
    statusTerapi,
  };
}

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string') {
    throw new Error(label + ' wajib berupa teks.');
  }

  const text = value.trim();
  if (!text || text.length > maxLength) {
    throw new Error(label + ' wajib diisi dan maksimal ' + maxLength + ' karakter.');
  }

  return text;
}

function parseIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Tanggal kedatangan harus berformat YYYY-MM-DD.');
  }

  const timezone = Session.getScriptTimeZone();
  const date = Utilities.parseDate(value, timezone, 'yyyy-MM-dd');
  if (Utilities.formatDate(date, timezone, 'yyyy-MM-dd') !== value) {
    throw new Error('Tanggal kedatangan tidak valid.');
  }

  return date;
}

function getRegistrationSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Script harus terhubung ke spreadsheet.');
  }

  return spreadsheet.getSheetByName(SHEET_NAME) ||
    spreadsheet.insertSheet(SHEET_NAME);
}

function prepareSheet(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  const currentHeaders = headerRange.getDisplayValues()[0];
  const isBlank = currentHeaders.every((value) => value.trim() === '');

  if (isBlank) {
    headerRange.setValues([HEADERS]);
  } else if (!HEADERS.every((header, index) => currentHeaders[index] === header)) {
    throw new Error(
      'Header tab "' + SHEET_NAME + '" tidak sesuai. Periksa enam kolom header.'
    );
  }

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 36);
  sheet.setColumnWidths(1, HEADERS.length, 160);
  sheet.setColumnWidth(1, 220);
  sheet.setColumnWidth(3, 150);
  sheet.setColumnWidth(4, 170);
  sheet.setColumnWidth(5, 220);

  const tableRange = sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length);
  if (sheet.getBandings().length === 0) {
    tableRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  }

  headerRange
    .setBackground('#0f766e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const dataRowCount = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 3, dataRowCount, 1).setNumberFormat('@');
  sheet.getRange(2, 4, dataRowCount, 1).setNumberFormat('dd mmm yyyy');

  if (!sheet.getFilter()) {
    tableRange.createFilter();
  }
}

function safeCellText(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
