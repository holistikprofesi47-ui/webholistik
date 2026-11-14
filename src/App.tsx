/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { OnboardingModal } from './components/OnboardingModal';
import { SafetyModal } from './components/SafetyModal';
import { TherapyDetailModal } from './components/TherapyDetailModal';
import { VideoPlayerModal } from './components/VideoPlayerModal';
import { BookingModal } from './components/BookingModal';
import { AppointmentDetailModal } from './components/AppointmentDetailModal';
import { NakesLoginModal } from './components/NakesLoginModal';
import { PatientAuthModal } from './components/PatientAuthModal';

import { HomeView } from './views/HomeView';
import { TherapyListView } from './views/TherapyListView';
import { VideoListView } from './views/VideoListView';
import { MyAppointmentsView } from './views/MyAppointmentsView';
import { ProfileView } from './views/ProfileView';
import { AdminDashboardView } from './views/AdminDashboardView';

import { ActiveTab, Therapy, Video, Appointment, UserProfile, AppointmentStatus, ClinicalProgressNote } from './types';
import { initAuth, logoutGoogle, getAccessToken } from './services/firebaseAuth';
import { safeStorage } from './utils/storage';
import { appendAppointmentToSheet, triggerRealtimeSheetSync } from './services/googleSheets';
import {
  saveAppointmentToFirestore,
  saveAppointmentScreening,
  deleteAppointmentFromFirestore,
  subscribeAppointments,
  subscribeProgressNotes,
  saveProgressNoteToFirestore,
  deleteProgressNoteFromFirestore
} from './services/firebaseFirestore';
import {
  getStoredAppointments,
  saveAppointments,
  getStoredTherapies,
  saveTherapies,
  getStoredVideos,
  saveVideos,
  getStoredUser,
  saveUser,
  getStoredLocations,
  hasSeenOnboarding,
  setOnboardingSeen,
  filterUserAppointments,
  clearUserSession,
  getStoredProgressNotes,
  saveProgressNotes
} from './utils/storage';

export default function App() {
  // Navigation & View States
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [isAdmin, setIsAdmin] = useState<boolean>(() => {
    return safeStorage.get('hnc_nakes_authenticated') === 'true';
  });
  const [showNakesLoginModal, setShowNakesLoginModal] = useState<boolean>(false);

  // Google OAuth & Sheets State
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => {
    return safeStorage.get('hnc_google_access_token');
  });

  // Core Data States
  const [therapies, setTherapies] = useState<Therapy[]>(getStoredTherapies);
  const [videos, setVideos] = useState<Video[]>(getStoredVideos);
  const [appointments, setAppointments] = useState<Appointment[]>(getStoredAppointments);
  const [progressNotes, setProgressNotes] = useState<ClinicalProgressNote[]>(getStoredProgressNotes);
  const [user, setUser] = useState<UserProfile>(getStoredUser);
  const locations = getStoredLocations();

  // Modals
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [showSafetyModal, setShowSafetyModal] = useState<boolean>(false);
  const [selectedTherapyForDetail, setSelectedTherapyForDetail] = useState<Therapy | null>(null);
  const [selectedVideoForPlayer, setSelectedVideoForPlayer] = useState<Video | null>(null);
  const [showBookingModal, setShowBookingModal] = useState<boolean>(false);
  const [showPatientAuthModal, setShowPatientAuthModal] = useState<boolean>(false);
  const [patientAuthPromptReason, setPatientAuthPromptReason] = useState<string | null>(null);
  const [pendingBookingTherapy, setPendingBookingTherapy] = useState<Therapy | null>(null);
  const [preSelectedTherapyForBooking, setPreSelectedTherapyForBooking] = useState<Therapy | null>(null);
  const [selectedAppointmentForDetail, setSelectedAppointmentForDetail] = useState<Appointment | null>(null);

  // Load & Realtime Subscription dari Firestore
  useEffect(() => {
    const unsubscribe = subscribeAppointments(
      user,
      isAdmin,
      (firestoreAppointments) => {
        if (firestoreAppointments && firestoreAppointments.length > 0) {
          setAppointments(firestoreAppointments);
          saveAppointments(firestoreAppointments);

          const activeToken = accessToken || safeStorage.get('hnc_google_access_token');
          if (activeToken) {
            triggerRealtimeSheetSync(activeToken, firestoreAppointments, 500);
          }
        }
      },
      (err) => {
        console.warn('Firestore appointments listener notice:', err);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [user, isAdmin, accessToken]);

  // Nakes Mode authentication handlers
  const handleRequestNakesAccess = () => {
    const isAuthenticated = safeStorage.get('hnc_nakes_authenticated') === 'true';
    if (isAuthenticated) {
      handleNakesLoginSuccess();
    } else {
      setShowNakesLoginModal(true);
    }
  };

  const handleNakesLoginSuccess = async () => {
    const guestUser = clearUserSession();
    setUser(guestUser);
    setSelectedAppointmentForDetail(null);
    setShowBookingModal(false);
    setPendingBookingTherapy(null);
    setPreSelectedTherapyForBooking(null);
    setPatientAuthPromptReason(null);

    setIsAdmin(true);
    setActiveTab('admin');
  };

  const handleExitNakesMode = async () => {
    safeStorage.remove('hnc_nakes_authenticated');
    safeStorage.remove('hnc_nakes_user');
    setIsAdmin(false);

    try {
      await logoutGoogle();
    } catch (e) {
      console.warn('Google logout during Nakes exit:', e);
    }
    setGoogleUser(null);
    setAccessToken(null);
    const guestUser = clearUserSession();
    setUser(guestUser);
    setSelectedAppointmentForDetail(null);
    setShowBookingModal(false);
    setPendingBookingTherapy(null);
    setPreSelectedTherapyForBooking(null);

    setActiveTab('home');
    setPatientAuthPromptReason('Anda telah keluar dari Mode Tenaga Kesehatan. Silakan masuk ke akun Pasien atau lanjutkan sebagai Tamu.');
    setShowPatientAuthModal(true);
  };

  // Check onboarding and Google auth on mount
  useEffect(() => {
    if (!hasSeenOnboarding()) {
      setShowOnboarding(true);
    }

    const unsubscribe = initAuth(
      (u, token) => {
        setGoogleUser(u);
        setAccessToken(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, []);

  // Real-time synchronization untuk Catatan Perkembangan Klinis (Rekam Medis) Nakes & Pasien
  useEffect(() => {
    const unsubscribeNotes = subscribeProgressNotes(
      null,
      true,
      (remoteNotes) => {
        if (remoteNotes && remoteNotes.length > 0) {
          setProgressNotes(remoteNotes);
          saveProgressNotes(remoteNotes);
        }
      },
      (err) => {
        console.warn('Real-time progress notes subscription notice:', err);
      }
    );

    return () => {
      if (typeof unsubscribeNotes === 'function') {
        unsubscribeNotes();
      }
    };
  }, []);

  const handleGoogleAuthSuccess = (u: any, token: string) => {
    setGoogleUser(u);
    setAccessToken(token);
    triggerRealtimeSheetSync(token, appointments, 100);
  };

  const handleGoogleLogout = async () => {
    await logoutGoogle();
    setGoogleUser(null);
    setAccessToken(null);
  };

  const handlePatientLogout = async () => {
    try {
      await logoutGoogle();
    } catch (e) {
      console.warn('Google logout warning:', e);
    }
    setGoogleUser(null);
    setAccessToken(null);
    const guestUser = clearUserSession();
    setUser(guestUser);
    setSelectedAppointmentForDetail(null);
    setShowBookingModal(false);
    setPreSelectedTherapyForBooking(null);
  };

  const handleAppointmentsChange = (updated: Appointment[]) => {
    setAppointments(updated);
    saveAppointments(updated);

    const activeToken =
      accessToken || safeStorage.get('hnc_google_access_token');
    if (activeToken) {
      triggerRealtimeSheetSync(activeToken, updated, 250);
    }
  };

  const handleTherapiesChange = (updated: Therapy[]) => {
    setTherapies(updated);
    saveTherapies(updated);
  };

  const handleVideosChange = (updated: Video[]) => {
    setVideos(updated);
    saveVideos(updated);
  };

  const handleUserChange = (updated: UserProfile) => {
    setUser(updated);
    saveUser(updated);
    setSelectedAppointmentForDetail(null);
    setPatientAuthPromptReason(null);

    if (pendingBookingTherapy !== null) {
      const therapyToBook = pendingBookingTherapy;
      setPendingBookingTherapy(null);
      setPreSelectedTherapyForBooking(therapyToBook);
      setShowBookingModal(true);
    } else {
      setShowBookingModal(false);
      setPreSelectedTherapyForBooking(null);
    }
  };

  const handleCloseOnboarding = () => {
    setShowOnboarding(false);
    setOnboardingSeen();
  };

  const handleOpenBooking = (therapy?: Therapy) => {
    if (!user || user.isGuest || !user.email) {
      setPendingBookingTherapy(therapy || null);
      setPatientAuthPromptReason('Silakan masuk (login) atau daftar akun pasien terlebih dahulu untuk melakukan reservasi.');
      setShowPatientAuthModal(true);
      return;
    }
    setPreSelectedTherapyForBooking(therapy || null);
    setShowBookingModal(true);
  };

  // Handler Sukses Pendaftaran
  const handleBookingSuccess = async (newAppointment: Appointment) => {
    // Optimistic update agar slot langsung terblokir seketika
    const updatedAppointments = [newAppointment, ...appointments.filter((a) => a.id !== newAppointment.id)];
    setAppointments(updatedAppointments);
    saveAppointments(updatedAppointments);

    // Sync ke Firestore
    try {
      await saveAppointmentToFirestore(newAppointment);
    } catch (e) {
      console.warn('Firestore sync error post-booking:', e);
    }

    const activeToken = accessToken || (await getAccessToken()) || safeStorage.get('hnc_google_access_token');
    if (activeToken) {
      try {
        await appendAppointmentToSheet(activeToken, newAppointment);
      } catch (err) {
        console.warn('Auto append to Google Sheet in App:', err);
      }
    }
  };

  const handleCancelAppointment = async (id: string, reason: string) => {
    const updated = appointments.map((app) => {
      if (app.id === id) {
        return {
          ...app,
          status: 'Dibatalkan' as AppointmentStatus,
          cancelledReason: reason
        };
      }
      return app;
    });
    handleAppointmentsChange(updated);
    if (selectedAppointmentForDetail && selectedAppointmentForDetail.id === id) {
      setSelectedAppointmentForDetail({
        ...selectedAppointmentForDetail,
        status: 'Dibatalkan',
        cancelledReason: reason
      });
    }

    // Persist status pembatalan ke database Firestore
    try {
      const target = updated.find((a) => a.id === id);
      if (target) {
        await saveAppointmentToFirestore(target);
      }
    } catch (err) {
      console.warn('Sync pembatalan jadwal ke Firestore error:', err);
    }
  };

  const handleUpdateAppointmentStatus = async (id: string, newStatus: AppointmentStatus) => {
    const updated = appointments.map((app) => {
      if (app.id === id) {
        return { ...app, status: newStatus };
      }
      return app;
    });
    handleAppointmentsChange(updated);

    // Persist pembaruan status ke database Firestore
    try {
      const target = updated.find((a) => a.id === id);
      if (target) {
        await saveAppointmentToFirestore(target);
      }
    } catch (err) {
      console.warn('Sync status jadwal ke Firestore error:', err);
    }
  };

  const handleCompleteScreening = async (
    appointmentId: string,
    screening: NonNullable<Appointment['contraindicationScreening']>,
    safe: boolean,
    nurseName: string,
    assessedAt: string
  ) => {
    const currentAppointment = appointments.find((appointment) => appointment.id === appointmentId);
    if (!currentAppointment) throw new Error('Jadwal tidak ditemukan. Muat ulang daftar jadwal lalu coba lagi.');

    await saveAppointmentScreening(appointmentId, screening, safe, nurseName, assessedAt);
    const updatedAppointment: Appointment = {
      ...currentAppointment,
      contraindicationScreening: screening,
      contraindicationSafe: safe,
      contraindicationAssessedBy: nurseName,
      contraindicationAssessedAt: assessedAt,
      status: safe ? 'Terjadwal' : 'Menunggu'
    };
    handleAppointmentsChange(
      appointments.map((appointment) =>
        appointment.id === appointmentId ? updatedAppointment : appointment
      )
    );
  };

  const handleDeleteAppointment = async (id: string) => {
    const updated = appointments.filter((app) => app.id !== id);
    handleAppointmentsChange(updated);
    if (selectedAppointmentForDetail && selectedAppointmentForDetail.id === id) {
      setSelectedAppointmentForDetail(null);
    }

    // Persist penghapusan ke Firestore
    try {
      await deleteAppointmentFromFirestore(id);
    } catch (err) {
      console.warn('Sync hapus jadwal ke Firestore error:', err);
    }
  };

  const handleAddTherapy = (newTherapy: Therapy) => {
    const updated = [newTherapy, ...therapies];
    handleTherapiesChange(updated);
  };

  const handleDeleteTherapy = (id: string) => {
    const updated = therapies.filter((t) => t.id !== id);
    handleTherapiesChange(updated);
  };

  const handleAddVideo = (newVideo: Video) => {
    const updated = [newVideo, ...videos];
    handleVideosChange(updated);
  };

  const handleDeleteVideo = (id: string) => {
    const updated = videos.filter((v) => v.id !== id);
    handleVideosChange(updated);
  };

  const handleAddProgressNote = async (newNote: ClinicalProgressNote) => {
    const updated = [newNote, ...progressNotes];
    setProgressNotes(updated);
    saveProgressNotes(updated);

    // Sync ke Firestore secara real-time
    try {
      await saveProgressNoteToFirestore(newNote);
    } catch (err) {
      console.warn('Sync progress note to Firestore notice:', err);
    }
  };

  const handleUpdateProgressNote = async (updatedNote: ClinicalProgressNote) => {
    const updated = progressNotes.map((n) => (n.id === updatedNote.id ? updatedNote : n));
    setProgressNotes(updated);
    saveProgressNotes(updated);

    // Sync ke Firestore secara real-time
    try {
      await saveProgressNoteToFirestore(updatedNote);
    } catch (err) {
      console.warn('Sync updated progress note to Firestore notice:', err);
    }
  };

  const handleDeleteProgressNote = async (id: string) => {
    const updated = progressNotes.filter((n) => n.id !== id);
    setProgressNotes(updated);
    saveProgressNotes(updated);

    // Sync hapus ke Firestore secara real-time
    try {
      await deleteProgressNoteFromFirestore(id);
    } catch (err) {
      console.warn('Sync delete progress note to Firestore notice:', err);
    }
  };

  const activeAppointmentsCount = useMemo(() => {
    const list = isAdmin ? appointments : filterUserAppointments(appointments, user);
    return list.filter(
      (a) => a.status === 'Terjadwal' || a.status === 'Menunggu'
    ).length;
  }, [appointments, isAdmin, user]);

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col font-sans selection:bg-emerald-200 selection:text-emerald-900 text-stone-800">
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSafety={() => setShowSafetyModal(true)}
        isAdmin={isAdmin}
        onRequestNakesAccess={handleRequestNakesAccess}
        onExitNakesMode={handleExitNakesMode}
        pendingAppointmentsCount={activeAppointmentsCount}
        currentUser={user}
        onOpenPatientAuth={() => setShowPatientAuthModal(true)}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-6 py-6 pb-24 md:pb-20">
        {activeTab === 'home' && (
          <HomeView
            therapies={therapies}
            onOpenDetail={(th) => setSelectedTherapyForDetail(th)}
            onOpenBooking={handleOpenBooking}
            setActiveTab={setActiveTab}
            onOpenSafety={() => setShowSafetyModal(true)}
            upcomingAppointments={filterUserAppointments(appointments, user)}
          />
        )}

        {activeTab === 'therapies' && (
          <TherapyListView
            therapies={therapies}
            onOpenDetail={(th) => setSelectedTherapyForDetail(th)}
            onOpenBooking={(th) => handleOpenBooking(th)}
          />
        )}

        {activeTab === 'videos' && (
          <VideoListView
            videos={videos}
            onSelectVideo={(vid) => setSelectedVideoForPlayer(vid)}
          />
        )}

        {activeTab === 'appointments' && (
          <MyAppointmentsView
            appointments={appointments}
            currentUser={user}
            progressNotes={progressNotes}
            onOpenBooking={() => handleOpenBooking()}
            onViewDetail={(app) => setSelectedAppointmentForDetail(app)}
            onCancelAppointment={handleCancelAppointment}
            onOpenPatientAuth={() => setShowPatientAuthModal(true)}
          />
        )}

        {activeTab === 'profile' && (
          <ProfileView
            user={user}
            onUpdateUser={handleUserChange}
            appointments={appointments}
            progressNotes={progressNotes}
            setActiveTab={setActiveTab}
            onOpenSafety={() => setShowSafetyModal(true)}
            isAdmin={isAdmin}
            onRequestNakesAccess={handleRequestNakesAccess}
            onExitNakesMode={handleExitNakesMode}
            onOpenPatientAuth={(reason) => {
              if (reason) setPatientAuthPromptReason(reason);
              setShowPatientAuthModal(true);
            }}
            onLogoutPatient={handlePatientLogout}
          />
        )}

        {activeTab === 'admin' && (
          <AdminDashboardView
            appointments={appointments}
            therapies={therapies}
            videos={videos}
            progressNotes={progressNotes}
            locations={locations}
            googleUser={googleUser}
            accessToken={accessToken}
            onGoogleAuthSuccess={handleGoogleAuthSuccess}
            onGoogleLogout={handleGoogleLogout}
            onExitNakesMode={handleExitNakesMode}
            onUpdateAppointmentStatus={handleUpdateAppointmentStatus}
            onCompleteScreening={handleCompleteScreening}
            onDeleteAppointment={handleDeleteAppointment}
            onAddTherapy={handleAddTherapy}
            onDeleteTherapy={handleDeleteTherapy}
            onAddVideo={handleAddVideo}
            onDeleteVideo={handleDeleteVideo}
            onAddProgressNote={handleAddProgressNote}
            onUpdateProgressNote={handleUpdateProgressNote}
            onDeleteProgressNote={handleDeleteProgressNote}
          />
        )}
      </main>

      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        appointmentsCount={activeAppointmentsCount}
        isAdmin={isAdmin}
      />

      {/* Patient Auth Modal */}
      <PatientAuthModal
        isOpen={showPatientAuthModal}
        onClose={() => {
          setShowPatientAuthModal(false);
          setPatientAuthPromptReason(null);
          setPendingBookingTherapy(null);
        }}
        currentUser={user}
        onSuccess={(updatedPatient) => {
          handleUserChange(updatedPatient);
        }}
        onPatientAuthSuccess={(updatedPatient) => {
          handleUserChange(updatedPatient);
        }}
        onGoogleAuthSuccess={handleGoogleAuthSuccess}
        onLogout={handlePatientLogout}
        authPromptReason={patientAuthPromptReason}
      />

      <NakesLoginModal
        isOpen={showNakesLoginModal}
        onClose={() => setShowNakesLoginModal(false)}
        onLoginSuccess={handleNakesLoginSuccess}
        onGoogleAuthSuccess={handleGoogleAuthSuccess}
      />
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={handleCloseOnboarding}
      />

      <SafetyModal
        isOpen={showSafetyModal}
        onClose={() => setShowSafetyModal(false)}
      />

      <TherapyDetailModal
        therapy={selectedTherapyForDetail}
        isOpen={!!selectedTherapyForDetail}
        onClose={() => setSelectedTherapyForDetail(null)}
        onSelectSchedule={(th) => {
          setSelectedTherapyForDetail(null);
          handleOpenBooking(th);
        }}
      />

      <VideoPlayerModal
        video={selectedVideoForPlayer}
        isOpen={!!selectedVideoForPlayer}
        onClose={() => setSelectedVideoForPlayer(null)}
      />

      <BookingModal
        isOpen={showBookingModal}
        onClose={() => {
          setShowBookingModal(false);
          setPreSelectedTherapyForBooking(null);
        }}
        therapies={therapies}
        locations={locations}
        preSelectedTherapy={preSelectedTherapyForBooking}
        existingAppointments={appointments}
        currentUser={user}
        accessToken={accessToken}
        googleUser={googleUser}
        onAuthSuccess={handleGoogleAuthSuccess}
        onBookingSuccess={handleBookingSuccess}
        onGoToMyAppointments={() => {
          setShowBookingModal(false);
          setActiveTab('appointments');
        }}
        onRequestAuth={() => {
          setPendingBookingTherapy(preSelectedTherapyForBooking || null);
          setPatientAuthPromptReason('Silakan masuk (login) atau daftar akun pasien terlebih dahulu untuk melakukan reservasi.');
          setShowPatientAuthModal(true);
        }}
      />

      <AppointmentDetailModal
        appointment={selectedAppointmentForDetail}
        isOpen={!!selectedAppointmentForDetail}
        onClose={() => setSelectedAppointmentForDetail(null)}
        onCancelAppointment={handleCancelAppointment}
        currentUser={user}
        isAdmin={isAdmin}
      />
    </div>
  );
}
