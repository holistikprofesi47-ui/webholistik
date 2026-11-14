import { Appointment } from '../types';

const PATIENT_REGISTRATION_ENDPOINT =
  'https://script.google.com/macros/s/AKfycby-k6rqj16Tquf3vKE2bg--87btsQ54N_mC5Gh_43HEMk3zS8c41S1Kwh_PQQy5Bi2zeg/exec';

export async function appendPatientRegistrationToEndpoint(
  appointment: Appointment
): Promise<void> {
  const registration = {
    nama: appointment.userName,
    jenisKelamin: appointment.gender || '',
    noRM: appointment.patientNumber,
    tanggalKedatangan: appointment.date,
    jenisTerapi: appointment.therapyName,
    statusTerapi: appointment.status,
  };

  await fetch(PATIENT_REGISTRATION_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
    },
    body: JSON.stringify(registration),
  });
}
