import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const email = 'holistikprofesi47@gmail.com';
const password = process.env.NAKES_PASSWORD;
const namaLengkap = 'Tenaga Kesehatan Holistik';
const spesialisasi = 'Umum / Holistik';
const serviceAccountPath = resolve(
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json',
);

if (!password) {
  throw new Error('Set environment variable NAKES_PASSWORD sebelum menjalankan skrip.');
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
const app = initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth(app);
const db = getFirestore(app);

async function daftarkanNakesBaru() {
  try {
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: namaLengkap,
    });

    const uid = userRecord.uid;
    console.log(`Akun Auth berhasil dibuat dengan UID: ${uid}`);

    await auth.setCustomUserClaims(uid, { nakes: true });
    console.log('Custom claims "nakes: true" berhasil disematkan.');

    await db.collection('nakes').doc(uid).set({
      uid,
      nama: namaLengkap,
      email,
      spesialisasi,
      createdAt: FieldValue.serverTimestamp(),
      status: 'aktif',
    });
    console.log('Profil berhasil disimpan ke Cloud Firestore.');

    console.log('--- Pendaftaran Nakes Selesai Sempurna! ---');
  } catch (error) {
    console.error('Gagal mendaftarkan nakes:', error);
    process.exitCode = 1;
  }
}

await daftarkanNakesBaru();
