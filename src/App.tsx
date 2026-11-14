import React, { useState } from 'react';
import { ShieldCheck, X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { db, handleFirestoreError, OperationType } from './lib/firebase.ts';
import { STUDY_PROGRAMS_UNUGHA } from './lib/seedContent.ts';
import { Navbar } from './components/Navbar.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import { StudentDashboard } from './components/StudentDashboard.tsx';
import { CounselorDashboard } from './components/CounselorDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { VideoCallRoom } from './components/VideoCallRoom.tsx';
import { CounselingCategory, CounselingSchedule } from './types/index.ts';

function MainAppContent() {
  const {
    firebaseUser,
    userAccount,
    authReady,
    loadingAuth,
    needsStudentOnboarding,
    siteAbout,
    toasts,
    dismissToast,
    signInWithGoogle,
    refreshProfile,
    pushToast,
  } = useAuth();

  const [activeView, setActiveView] = useState<'public' | 'dashboard' | 'video'>('public');
  const [selectedCategory, setSelectedCategory] = useState<CounselingCategory | null>(null);
  const [activeVideoSchedule, setActiveVideoSchedule] = useState<CounselingSchedule | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  // Student onboarding fields
  const [onbName, setOnbName] = useState('');
  const [onbNim, setOnbNim] = useState('');
  const [onbProdi, setOnbProdi] = useState(STUDY_PROGRAMS_UNUGHA[0]);
  const [onbSemester, setOnbSemester] = useState(1);
  const [onbConsent, setOnbConsent] = useState(false);
  const [savingOnboarding, setSavingOnboarding] = useState(false);

  const handleNavigatePublic = (sectionId?: string) => {
    setActiveView('public');
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        el?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    }
  };

  const handleStartCounseling = (category?: CounselingCategory) => {
    if (category) setSelectedCategory(category);
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    setActiveView('dashboard');
  };

  const handleOpenDashboard = () => {
    if (!firebaseUser) {
      setAuthModalOpen(true);
      return;
    }
    setActiveView('dashboard');
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      setAuthModalOpen(false);
      setActiveView('dashboard');
    } catch {
      // toast already handled in context
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !onbConsent) {
      pushToast('Persetujuan Diperlukan', 'Centang persetujuan kebijakan privasi untuk melanjutkan.', 'error');
      return;
    }
    setSavingOnboarding(true);
    try {
      await setDoc(doc(db, 'studentProfiles', firebaseUser.uid), {
        uid: firebaseUser.uid,
        fullName: (onbName || userAccount?.displayName || '').trim().slice(0, 120),
        nim: onbNim.trim().slice(0, 32),
        studyProgram: onbProdi,
        semester: Number(onbSemester),
        privacyConsentAccepted: true,
        consentAcceptedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await refreshProfile();
      pushToast('Profil Tersimpan', 'Selamat datang di Portal Mahasiswa Ruang Tumbuh.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studentProfiles/${firebaseUser.uid}`);
    } finally {
      setSavingOnboarding(false);
    }
  };

  const handleJoinVideoCall = (schedule: CounselingSchedule) => {
    setActiveVideoSchedule(schedule);
    setActiveView('video');
  };

  return (
    <div className="min-h-screen bg-[#F7F4EC] text-[#1E2B24] flex flex-col">
      <Navbar
        activeView={activeView}
        onNavigatePublic={handleNavigatePublic}
        onOpenDashboard={handleOpenDashboard}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      {/* Main View Switcher */}
      <div className="flex-1">
        {!authReady ? (
          <div className="mx-auto max-w-7xl px-6 py-20 text-center space-y-3">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#315E4B] border-t-transparent" />
            <p className="text-sm text-[#45564D]">Memuat Ruang Tumbuh...</p>
          </div>
        ) : activeView === 'video' && activeVideoSchedule && firebaseUser ? (
          <VideoCallRoom
            schedule={activeVideoSchedule}
            onExit={() => {
              setActiveVideoSchedule(null);
              setActiveView('dashboard');
            }}
          />
        ) : activeView === 'dashboard' && firebaseUser && userAccount ? (
          userAccount.isActive === false ? (
            <div className="mx-auto max-w-lg px-6 py-20 text-center space-y-4">
              <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
              <h1 className="text-xl font-bold text-[#1E2B24]">Akun Sedang Dinonaktifkan</h1>
              <p className="text-sm text-[#45564D]">
                Silakan hubungi Laboratorium BK UNUGHA ({siteAbout.contactEmail}) untuk mengaktifkan kembali akun Anda.
              </p>
            </div>
          ) : userAccount.role === 'admin' ? (
            <AdminDashboard />
          ) : userAccount.role === 'counselor' ? (
            <CounselorDashboard onJoinVideoCall={handleJoinVideoCall} />
          ) : (
            <StudentDashboard
              initialCategory={selectedCategory}
              onJoinVideoCall={handleJoinVideoCall}
              onOpenPrivacyModal={() => setPrivacyModalOpen(true)}
            />
          )
        ) : (
          <LandingPage
            onStartCounseling={handleStartCounseling}
            onOpenPrivacyModal={() => setPrivacyModalOpen(true)}
          />
        )}
      </div>

      {/* Login / Register Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#EAE3D2] bg-white p-7 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-[#315E4B]">Ruang Tumbuh · Lab BK UNUGHA</p>
                <h2 className="mt-1 text-xl font-bold text-[#1E2B24]">Masuk atau Daftar Akun</h2>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="rounded-lg border border-[#EAE3D2] p-1.5 text-[#45564D]"
                aria-label="Tutup jendela masuk"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-sm text-[#45564D] leading-relaxed">
              Masuk dengan akun Google Anda (disarankan menggunakan email kampus UNUGHA). Peran Mahasiswa, Konselor Terdaftar, atau Admin akan terdeteksi secara otomatis dan aman.
            </p>

            <button
              type="button"
              disabled={loadingAuth}
              onClick={handleGoogleSignIn}
              className="w-full rounded-xl bg-[#315E4B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#244738] disabled:opacity-60 transition-colors"
            >
              {loadingAuth ? 'Menghubungkan ke Google...' : 'Lanjutkan dengan Akun Google'}
            </button>

            <p className="text-xs text-[#596B61] text-center">
              Dengan masuk, Anda menyetujui{' '}
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(true)}
                className="font-semibold text-[#315E4B] underline"
              >
                Kebijakan Privasi & Ketentuan Penggunaan
              </button>
              .
            </p>
          </div>
        </div>
      )}

      {/* First-Time Student Onboarding Modal */}
      {activeView === 'dashboard' && needsStudentOnboarding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
            <div>
              <p className="text-xs font-semibold text-[#315E4B]">Lengkapi Data Mahasiswa</p>
              <h2 className="mt-1 text-xl font-bold text-[#1E2B24]">Selamat Datang di Ruang Tumbuh</h2>
              <p className="mt-1 text-xs text-[#596B61]">
                Lengkapi data akademik dasar Anda untuk mempermudah pengajuan jadwal konseling Lab BK UNUGHA.
              </p>
            </div>

            <form onSubmit={handleCompleteOnboarding} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#35443C] mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={onbName || userAccount?.displayName || ''}
                  onChange={(e) => setOnbName(e.target.value)}
                  className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#35443C] mb-1">NIM</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 24CI10027"
                    value={onbNim}
                    onChange={(e) => setOnbNim(e.target.value)}
                    className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#35443C] mb-1">Semester</label>
                  <select
                    value={onbSemester}
                    onChange={(e) => setOnbSemester(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums"
                  >
                    {Array.from({ length: 14 }, (_, i) => i + 1).map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#35443C] mb-1">Program Studi</label>
                <select
                  value={onbProdi}
                  onChange={(e) => setOnbProdi(e.target.value)}
                  className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                >
                  {STUDY_PROGRAMS_UNUGHA.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-start gap-2.5 text-xs text-[#35443C] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onbConsent}
                  onChange={(e) => setOnbConsent(e.target.checked)}
                  className="mt-0.5 accent-[#315E4B]"
                />
                <span>
                  Saya menyetujui Kebijakan Privasi dan Ketentuan Penggunaan layanan Lab BK UNUGHA.
                </span>
              </label>
              <button
                type="submit"
                disabled={savingOnboarding}
                className="w-full rounded-xl bg-[#315E4B] px-5 py-3 text-sm font-semibold text-white hover:bg-[#244738]"
              >
                {savingOnboarding ? 'Menyimpan...' : 'Simpan & Masuk ke Dashboard'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Privacy Policy & Terms Modal */}
      {privacyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2 text-[#315E4B]">
                <ShieldCheck className="h-5 w-5" />
                <h2 className="text-xl font-bold text-[#1E2B24]">
                  Kebijakan Privasi & Ketentuan Penggunaan Ruang Tumbuh
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                className="rounded-lg border border-[#EAE3D2] p-1.5"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm text-[#35443C] leading-relaxed">
              <div>
                <h3 className="font-bold text-[#1E2B24]">1. Prinsip Kerahasiaan Konseling</h3>
                <p>
                  Seluruh layanan Bimbingan dan Konseling di Ruang Tumbuh UNUGHA tunduk pada kode etik profesi BK. Gambaran permasalahan mahasiswa dan catatan sesi konseling privat hanya dapat diakses oleh konselor yang ditugaskan. Admin Lab BK hanya memproses data administratif (nama, NIM, prodi, metode, dan penjadwalan).
                </p>
              </div>
              <div>
                <h3 className="font-bold text-[#1E2B24]">2. Keamanan Sesi Video Call Real-Time</h3>
                <p>
                  Komunikasi video call konseling berlangsung secara terenkripsi antara mahasiswa dan konselor yang terjadwal. Platform tidak melakukan perekaman video maupun audio secara otomatis dan melarang akses pihak ketiga tanpa otorisasi sah.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-[#1E2B24]">3. Hak Pencadangan, Retensi, dan Penghapusan Data</h3>
                <p>
                  Data administratif disimpan sesuai masa retensi {siteAbout.retentionDays || 365} hari. Mahasiswa berhak mengunduh salinan data refleksi diri (jurnal & mood tracker) maupun menghapus entri refleksi pribadi kapan saja melalui menu Profil & Privasi.
                </p>
              </div>
              <div>
                <h3 className="font-bold text-[#1E2B24]">4. Batasan Layanan Non-Darurat</h3>
                <p>
                  Layanan ini bersifat pendampingan bimbingan dan konseling kampus gratis bagi mahasiswa UNUGHA. Asesmen awal bersifat non-diagnostik. Jika Anda mengalami krisis darurat keselamatan diri, segera hubungi layanan darurat terdekat atau IGD rumah sakit.
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-[#EAE3D2] flex justify-end">
              <button
                type="button"
                onClick={() => setPrivacyModalOpen(false)}
                className="rounded-lg bg-[#315E4B] px-5 py-2 text-sm font-semibold text-white"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Toast Notifications Stack */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full px-4 sm:px-0">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-[#C6D4C8] bg-white p-4 shadow-lg flex items-start gap-3"
            >
              {t.variant === 'success' ? (
                <CheckCircle2 className="h-5 w-5 text-[#315E4B] shrink-0 mt-0.5" />
              ) : t.variant === 'error' ? (
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-5 w-5 text-[#315E4B] shrink-0 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <p className="font-bold text-[#1E2B24]">{t.title}</p>
                <p className="mt-0.5 text-[#45564D]">{t.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                className="text-[#596B61] hover:text-[#1E2B24]"
                aria-label="Tutup notifikasi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
