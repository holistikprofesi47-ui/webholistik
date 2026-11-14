# HOLISTIC NURSING CARE (Web App Final)
> Aplikasi Edukasi, Reservasi Tindakan Keperawatan Holistik, & Rekam Medis Elektronik Terintegrasi (Universitas Diponegoro).

Aplikasi ini dibangun menggunakan **React 19 + TypeScript + Vite + Tailwind CSS**, terintegrasi penuh secara real-time dengan:
- **Firebase Firestore & Authentication** (Autentikasi pasien, jadwal reservasi, rekam medis SOAP, TTV klinis, & multi-device sync)
- **Google Sheets API** (Pencatatan rekapitulasi data otomatis ke spreadsheet pengelola)

---

## 🚀 Panduan Publikasi / Hosting Simpel (Tanpa Ribet Server Sendiri)

Aplikasi ini bertipe **Modern Frontend SPA (Single Page Application)** dengan arsitektur **Serverless (BaaS)**, sehingga:
- **TIDAK PERLU** sewa VPS atau konfigurasi server Linux manual.
- **TIDAK PERLU** mengelola database lokal yang memakan biaya, karena database Firebase sudah aktif terhubung langsung di kode.
- Dapat dihosting **100% GRATIS** dengan performa tinggi & SSL (HTTPS) otomatis.

---

### OPSI 1: Deploy ke VERCEL (Sangat Direkomendasikan - Paling Simpel & Cepat)
1. **Buat Akun**: Buka [vercel.com](https://vercel.com) dan login menggunakan akun GitHub Anda.
2. **Import Repository**:
   - Klik tombol **"Add New..."** ➔ **"Project"**.
   - Pilih repositori GitHub proyek ini (`web-holistik` atau nama repositori Anda).
3. **Pengaturan Build**:
   - Vercel akan otomatis mendeteksi **Vite**.
   - Build Command: `npm run build`
   - Output Directory: `dist`
   *(Pengaturan ini sudah otomatis disiapkan di file `vercel.json`)*.
4. **Klik "Deploy"**:
   - Dalam ~1 menit, website Anda sudah aktif dengan domain gratis seperti `https://nama-web-anda.vercel.app`!

---

### OPSI 2: Deploy ke NETLIFY (Bisa Drag & Drop Folder `dist` Tanpa Git)
1. Buka [netlify.com](https://www.netlify.com) dan masuk.
2. **Metode Drag & Drop**:
   - Jalankan perintah build di komputer:
     ```bash
     npm install
     npm run build
     ```
   - Folder `dist` akan terbentuk.
   - Buka dashboard Netlify ➔ buka menu **Sites** ➔ seret dan lepaskan (*drag and drop*) folder `dist` ke area yang tersedia.
   - Website langsung online dalam 10 detik!
3. **Metode Git**:
   - Hubungkan repositori GitHub Anda ke Netlify.
   - File konfigurasi `netlify.toml` sudah tersedia di proyek ini untuk menangani routing SPA tanpa error 404.

---

## 🛠️ Cara Menjalankan Proyek Secara Lokal di Komputer

1. **Persyaratan**:
   - Pastikan [Node.js](https://nodejs.org) (versi 18+) sudah terpasang.

2. **Ekstraksi Proyek**:
   - Ekstrak file zip proyek ke folder komputer Anda.

3. **Install Dependensi & Jalankan**:
   ```bash
   npm install
   npm run dev
   ```
   Buka peramban Anda di `http://localhost:3000`.

4. **Build untuk Produksi**:
   ```bash
   npm run build
   ```
   File hasil kompilasi siap dipublikasikan berada di folder `dist`.

---

## 🔑 Kredensial & Akses Pengelola (Nakes)

- **Portal Pasien**:
  - Pasien dapat langsung mendaftar baru atau masuk dengan **Email**, **Nomor Rekam Medis (No. RM)**, atau **Nomor WhatsApp**.
  - Nomor Rekam Medis otomatis digenerate dengan format `RM-HNC-XXXX`.
- **Portal Tenaga Kesehatan (Admin / Nakes)**:
  - Tombol: **"Masuk Nakes"** di header navigasi atas.
  - Kode Sandi Resmi: `Undipjaya` atau `1234`
  - Email Pengelola: `holistikundip@gmail.com`
  - Fitur Nakes: Manajemen Janji Temu, Pengubahan Status Sesi, Live Sync, Ekspor Data CSV, Ringkasan Okupansi Lokasi, dan Catatan Perkembangan Klinis (SOAP & TTV).

---

## 📋 Fitur Unggulan yang Sudah Aktif

1. **Sesi Terbatas 1 Orang**: Sistem mencegah bentrok jadwal (double-booking guard secara real-time).
2. **Jam Operasional Sesuai Lokasi**:
   - Departemen Ilmu Keperawatan & SMPIT Cahaya Ummat: 08.00 – 15.30 WIB.
   - Dipocare Universitas Diponegoro: 08.00 – 20.30 WIB.
3. **Rekam Medis & Asuhan Keperawatan**:
   - Profil pasien mencatat status perkawinan dan pekerjaan; setiap booking menunggu skrining kontraindikasi Ners.
   - Catatan SOAP pada Modal Profil Pasien disimpan terpisah di koleksi privat `nurse_clinical_records`. Catatan Perkembangan tetap menggunakan `clinical_progress_notes`.
   - SOAP, Tanda-Tanda Vital (Tekanan Darah, Nadi, Pernapasan, Skala Nyeri 0–10), dan Cetak Rekam Medis.
4. **Live Sync Real-Time**: Sinkronisasi lintas perangkat aktif di Cloud Firestore, Firebase Realtime Database, dan Google Spreadsheet.
5. **Ekspor CSV**: Unduh seluruh rekaman janji temu format CSV dengan standar UTF-8 BOM.

### Akses Rekam Medis Perawat

- Terapkan `firestore.rules` ke Firebase sebelum menggunakan skrining atau koleksi SOAP privat.
- Skrining pra-tindakan dan koleksi `nurse_clinical_records` memerlukan sesi Firebase Authentication non-anonim dengan akun staf resmi (`holistikprofesi47@gmail.com`, `holistikundip@gmail.com`) atau UID yang telah didaftarkan pada koleksi `admins`.
- Login kode sandi lokal hanya membuka dashboard frontend; kode sandi tersebut bukan kredensial Firebase dan tidak dapat membaca/menulis data medis privat.
- Catatan perawat tidak ditampilkan dalam portal pasien dan tidak memerlukan tanda tangan fisik.

