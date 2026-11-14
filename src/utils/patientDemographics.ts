import { UserProfile } from '../types';

export type AgeParts = {
  years: number;
  months: number;
  days: number;
};

const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month, day));

const addMonthsClamped = (date: Date, months: number) => {
  const targetMonth = date.getUTCMonth() + months;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDayOfMonth = utcDate(targetYear, normalizedMonth + 1, 0).getUTCDate();
  return utcDate(targetYear, normalizedMonth, Math.min(date.getUTCDate(), lastDayOfMonth));
};

export const getLocalDateInputValue = (date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getAgeParts = (dateOfBirth: string, referenceDate = new Date()): AgeParts | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;

  const birthDate = utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    birthDate.getUTCFullYear() !== Number(match[1]) ||
    birthDate.getUTCMonth() !== Number(match[2]) - 1 ||
    birthDate.getUTCDate() !== Number(match[3])
  ) {
    return null;
  }

  const today = utcDate(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (birthDate > today) return null;

  let years = today.getUTCFullYear() - birthDate.getUTCFullYear();
  let anniversary = addMonthsClamped(birthDate, years * 12);
  if (anniversary > today) {
    years -= 1;
    anniversary = addMonthsClamped(birthDate, years * 12);
  }

  let months =
    (today.getUTCFullYear() - anniversary.getUTCFullYear()) * 12 +
    today.getUTCMonth() -
    anniversary.getUTCMonth();
  let monthAnchor = addMonthsClamped(anniversary, months);
  if (monthAnchor > today) {
    months -= 1;
    monthAnchor = addMonthsClamped(anniversary, months);
  }

  const days = Math.floor((today.getTime() - monthAnchor.getTime()) / 86400000);
  return { years, months, days };
};

export const formatAge = (age: AgeParts | null): string => {
  if (!age) return '';
  return `${age.years} tahun, ${age.months} bulan, ${age.days} hari`;
};

export const getPatientDisplayName = (
  name: string,
  patient?: Pick<UserProfile, 'dateOfBirth' | 'gender' | 'maritalStatus'> | null
): string => {
  const cleanName = name.trim().replace(/^(Tn\.|Nn\.|Ny\.|An\.)\s*/i, '');
  if (!patient?.dateOfBirth) return name;

  const age = getAgeParts(patient.dateOfBirth);
  if (!age || age.years > 100) return name;

  let title = '';
  if (age.years < 18) {
    title = 'An.';
  } else if (patient.gender === 'Laki-laki') {
    title = 'Tn.';
  } else if (patient.gender === 'Perempuan') {
    const maritalStatus = patient.maritalStatus?.toLowerCase();
    if (maritalStatus === 'sudah menikah' || maritalStatus === 'menikah') title = 'Ny.';
    if (maritalStatus === 'belum menikah') title = 'Nn.';
  }

  return title ? `${title} ${cleanName}` : name;
};

export const getGenderBadgeClass = (gender?: UserProfile['gender']): string =>
  gender === 'Laki-laki'
    ? 'bg-sky-100 text-sky-800 border-sky-200'
    : 'bg-pink-100 text-pink-800 border-pink-200';
