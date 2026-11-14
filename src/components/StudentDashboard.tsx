import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FilePlus2,
  CalendarClock,
  History,
  Smile,
  BookHeart,
  ClipboardCheck,
  Newspaper,
  Bell,
  UserCog,
  Video,
  CheckCircle2,
  Download,
  Trash2,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { DEMO_ARTICLES, STUDY_PROGRAMS_UNUGHA } from '../lib/seedContent.ts';
import { formatDateId, formatTimestampId, isScheduleJoinable, todayDateWIB } from '../lib/timeWindow.ts';
import {
  Article,
  AssessmentResult,
  CATEGORY_LABELS,
  CounselingCategory,
  CounselingMethod,
  CounselingRequest,
  CounselingSchedule,
  FollowUp,
  JournalEntry,
  MoodEntry,
  MoodType,
  REQUEST_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
} from '../types/index.ts';

interface StudentDashboardProps {
  initialCategory?: CounselingCategory | null;
  initialTab?: StudentTab;
  onJoinVideoCall: (schedule: CounselingSchedule) => void;
  onOpenPrivacyModal: () => void;
}

export type StudentTab =
  | 'overview'
  | 'request'
  | 'history'
  | 'mood'
  | 'journal'
  | 'assessment'
  | 'articles'
  | 'notifications'
  | 'profile';

const MOOD_OPTIONS: Array<{ value: MoodType; emoji: string; label: string }> = [
  { value: 'senang', emoji: '😊', label: 'Senang' },
  { value: 'tenang', emoji: '😌', label: 'Tenang' },
  { value: 'biasa', emoji: '😐', label: 'Biasa' },
  { value: 'cemas', emoji: '😟', label: 'Cemas' },
  { value: 'lelah', emoji: '😴', label: 'Lelah' },
  { value: 'sedih', emoji: '😢', label: 'Sedih' },
];

const REFLECTION_PROMPTS = [
  'Apa satu hal yang paling menyita pikiranmu minggu ini, dan apa yang berada di dalam kendalimu?',
  'Ceritakan satu pencapaian kecil hari ini yang layak kamu syukuri.',
  'Kapan terakhir kali kamu merasa benar-benar tenang, dan apa yang membantu perasaan itu hadir?',
  'Apa dukungan yang paling kamu butuhkan dari orang di sekitarmu saat ini?',
];

const ASSESSMENT_QUESTIONS: Array<{
  id: string;
  domain: CounselingCategory;
  text: string;
}> = [
  { id: 'q1', domain: 'pribadi', text: 'Saya sering merasa cemas, terbebani, atau sulit menenangkan pikiran dalam dua minggu terakhir.' },
  { id: 'q2', domain: 'pribadi', text: 'Perasaan lelah emosional memengaruhi kualitas tidur dan kestabilan suasana hati saya.' },
  { id: 'q3', domain: 'sosial', text: 'Saya mengalami kesulitan menyampaikan pendapat atau menjaga batasan sehat dengan teman/organisasi.' },
  { id: 'q4', domain: 'sosial', text: 'Saya merasa kurang nyaman atau terisolasi saat berinteraksi di lingkungan kampus.' },
  { id: 'q5', domain: 'belajar', text: 'Saya kesulitan mengatur jadwal belajar, fokus kuliah, atau sering menunda pengerjaan tugas.' },
  { id: 'q6', domain: 'belajar', text: 'Motivasi akademik saya menurun dan membuat saya khawatir terhadap capaian studi.' },
  { id: 'q7', domain: 'karier', text: 'Saya masih bingung mengenali minat, bakat, serta arah karier setelah lulus kuliah.' },
  { id: 'q8', domain: 'karier', text: 'Saya membutuhkan arahan untuk menyusun rencana pengembangan diri dan portofolio karier.' },
];

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  initialCategory,
  initialTab,
  onJoinVideoCall,
  onOpenPrivacyModal,
}) => {
  const {
    firebaseUser,
    userAccount,
    studentProfile,
    notifications,
    unreadCount,
    siteAbout,
    pushToast,
    refreshProfile,
    markNotificationRead,
    sendNotification,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<StudentTab>(
    initialTab || (initialCategory ? 'request' : 'overview')
  );
  const [loadingData, setLoadingData] = useState(true);

  const [requests, setRequests] = useState<CounselingRequest[]>([]);
  const [schedules, setSchedules] = useState<CounselingSchedule[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [moods, setMoods] = useState<MoodEntry[]>([]);
  const [assessments, setAssessments] = useState<AssessmentResult[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);

  // Request Form State
  const [reqName, setReqName] = useState(studentProfile?.fullName || userAccount?.displayName || '');
  const [reqNim, setReqNim] = useState(studentProfile?.nim || '');
  const [reqProdi, setReqProdi] = useState(studentProfile?.studyProgram || STUDY_PROGRAMS_UNUGHA[0]);
  const [reqSemester, setReqSemester] = useState<number>(studentProfile?.semester || 1);
  const [reqCategory, setReqCategory] = useState<CounselingCategory>(initialCategory || 'pribadi');
  const [reqMethod, setReqMethod] = useState<CounselingMethod>('online');
  const [reqDate, setReqDate] = useState(todayDateWIB());
  const [reqTime, setReqTime] = useState('09:00');
  const [reqSummary, setReqSummary] = useState('');
  const [reqConsent, setReqConsent] = useState(false);
  const [submittingReq, setSubmittingReq] = useState(false);
  const [reqSuccessBanner, setReqSuccessBanner] = useState(false);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<CounselingSchedule | null>(null);
  const [rescheduleNote, setRescheduleNote] = useState('');

  // Mood state
  const [moodType, setMoodType] = useState<MoodType>('tenang');
  const [moodIntensity, setMoodIntensity] = useState(3);
  const [moodNote, setMoodNote] = useState('');

  // Journal state
  const [journalTitle, setJournalTitle] = useState('');
  const [journalPrompt, setJournalPrompt] = useState(REFLECTION_PROMPTS[0]);
  const [journalContent, setJournalContent] = useState('');
  const [editingJournalId, setEditingJournalId] = useState<string | null>(null);

  // Assessment state
  const [answers, setAnswers] = useState<Record<string, number>>({
    q1: 3, q2: 3, q3: 2, q4: 2, q5: 3, q6: 3, q7: 3, q8: 3,
  });

  // Article reader
  const [readingArticle, setReadingArticle] = useState<Article | null>(null);

  // Profile form
  const [profName, setProfName] = useState(studentProfile?.fullName || userAccount?.displayName || '');
  const [profNim, setProfNim] = useState(studentProfile?.nim || '');
  const [profProdi, setProfProdi] = useState(studentProfile?.studyProgram || STUDY_PROGRAMS_UNUGHA[0]);
  const [profSemester, setProfSemester] = useState<number>(studentProfile?.semester || 1);
  const [profPhone, setProfPhone] = useState(studentProfile?.phone || '');
  const [profEmergency, setProfEmergency] = useState(studentProfile?.emergencyContact || '');

  useEffect(() => {
    if (initialCategory) {
      setReqCategory(initialCategory);
      setActiveTab('request');
    }
  }, [initialCategory]);

  useEffect(() => {
    if (studentProfile) {
      setReqName(studentProfile.fullName);
      setReqNim(studentProfile.nim);
      setReqProdi(studentProfile.studyProgram);
      setReqSemester(studentProfile.semester);
      setProfName(studentProfile.fullName);
      setProfNim(studentProfile.nim);
      setProfProdi(studentProfile.studyProgram);
      setProfSemester(studentProfile.semester);
      setProfPhone(studentProfile.phone || '');
      setProfEmergency(studentProfile.emergencyContact || '');
    }
  }, [studentProfile]);

  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'counselingRequests'), where('uid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingRequest, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setRequests(list);
          setLoadingData(false);
        },
        () => setLoadingData(false)
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'counselingSchedules'), where('studentUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingSchedule, 'id'>) }))
            .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
          setSchedules(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'followUps'), where('studentUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FollowUp, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setFollowUps(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'journals'), where('uid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<JournalEntry, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setJournals(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'moodTrackers'), where('uid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<MoodEntry, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setMoods(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'assessments'), where('uid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AssessmentResult, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setAssessments(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'articles'), where('published', '==', true)),
        (snap) => {
          setArticles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Article, 'id'>) })));
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    if (!reqConsent) {
      pushToast('Persetujuan Diperlukan', 'Silakan setujui kebijakan privasi sebelum mengirim pengajuan.', 'error');
      return;
    }
    if (reqSummary.trim().length < 10) {
      pushToast('Deskripsi Terlalu Singkat', 'Tuliskan gambaran singkat permasalahan minimal 10 karakter.', 'error');
      return;
    }

    setSubmittingReq(true);
    try {
      const requestDoc = await addDoc(collection(db, 'counselingRequests'), {
        uid: firebaseUser.uid,
        studentName: reqName.trim().slice(0, 120),
        nim: reqNim.trim().slice(0, 32),
        studyProgram: reqProdi.trim().slice(0, 120),
        semester: Number(reqSemester),
        category: reqCategory,
        method: reqMethod,
        preferredDate: reqDate,
        preferredTime: reqTime,
        privacyConsent: true,
        status: 'new',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Store personal story in isolated subcollection inaccessible to Admin
      await setDoc(doc(db, 'counselingRequests', requestDoc.id, 'privateDetail', 'story'), {
        uid: firebaseUser.uid,
        issueSummary: reqSummary.trim().slice(0, 3000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Ensure student profile exists/updated
      if (!studentProfile) {
        await setDoc(doc(db, 'studentProfiles', firebaseUser.uid), {
          uid: firebaseUser.uid,
          fullName: reqName.trim().slice(0, 120),
          nim: reqNim.trim().slice(0, 32),
          studyProgram: reqProdi.trim().slice(0, 120),
          semester: Number(reqSemester),
          privacyConsentAccepted: true,
          consentAcceptedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await refreshProfile();
      }

      // Notify Admin
      await sendNotification({
        targetUid: 'ADMIN_BROADCAST',
        targetRole: 'admin',
        title: 'Pengajuan Konseling Baru',
        message: `${reqName.trim()} (${reqNim.trim()}) mengajukan ${CATEGORY_LABELS[reqCategory]} metode ${reqMethod}.`,
        type: 'request',
      });

      setReqSummary('');
      setReqConsent(false);
      setReqSuccessBanner(true);
      pushToast(
        'Pengajuan Diterima',
        'Pengajuan berhasil diterima dan sedang menunggu konfirmasi dari Admin Lab BK.',
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'counselingRequests');
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleCancelRequest = async (reqId: string) => {
    try {
      await updateDoc(doc(db, 'counselingRequests', reqId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      pushToast('Pengajuan Dibatalkan', 'Pengajuan konseling berhasil dibatalkan.', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingRequests/${reqId}`);
    }
  };

  const handleRequestReschedule = async () => {
    if (!rescheduleTarget || !rescheduleNote.trim()) return;
    try {
      await updateDoc(doc(db, 'counselingSchedules', rescheduleTarget.id), {
        status: 'reschedule_requested',
        rescheduleNote: rescheduleNote.trim().slice(0, 500),
        updatedAt: serverTimestamp(),
      });
      await sendNotification({
        targetUid: 'ADMIN_BROADCAST',
        targetRole: 'admin',
        title: 'Permintaan Ubah Jadwal Mahasiswa',
        message: `${rescheduleTarget.studentName} mengusulkan perubahan jadwal (${rescheduleTarget.date} ${rescheduleTarget.startTime}): ${rescheduleNote.trim()}`,
        type: 'schedule',
      });
      await sendNotification({
        targetUid: rescheduleTarget.counselorUid,
        targetRole: 'counselor',
        title: 'Usulan Perubahan Jadwal',
        message: `${rescheduleTarget.studentName} mengusulkan perubahan jadwal konseling.`,
        type: 'schedule',
      });
      setRescheduleTarget(null);
      setRescheduleNote('');
      pushToast('Usulan Terkirim', 'Permintaan perubahan jadwal telah diteruskan ke Admin Lab BK.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingSchedules/${rescheduleTarget.id}`);
    }
  };

  const handleSaveMood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    try {
      await addDoc(collection(db, 'moodTrackers'), {
        uid: firebaseUser.uid,
        mood: moodType,
        intensity: Number(moodIntensity),
        note: moodNote.trim().slice(0, 500),
        date: todayDateWIB(),
        createdAt: serverTimestamp(),
      });
      setMoodNote('');
      pushToast('Mood Tercatat', 'Suasana hatimu hari ini berhasil disimpan.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'moodTrackers');
    }
  };

  const handleSaveJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !journalTitle.trim() || !journalContent.trim()) return;
    try {
      if (editingJournalId) {
        await updateDoc(doc(db, 'journals', editingJournalId), {
          title: journalTitle.trim().slice(0, 200),
          content: journalContent.trim().slice(0, 6000),
          reflectionPrompt: journalPrompt.slice(0, 300),
          updatedAt: serverTimestamp(),
        });
        setEditingJournalId(null);
        pushToast('Jurnal Diperbarui', 'Catatan refleksi diri berhasil diperbarui.', 'success');
      } else {
        await addDoc(collection(db, 'journals'), {
          uid: firebaseUser.uid,
          title: journalTitle.trim().slice(0, 200),
          content: journalContent.trim().slice(0, 6000),
          reflectionPrompt: journalPrompt.slice(0, 300),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        pushToast('Jurnal Tersimpan', 'Jurnal refleksi pribadimu aman tersimpan.', 'success');
      }
      setJournalTitle('');
      setJournalContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'journals');
    }
  };

  const handleDeleteJournal = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'journals', id));
      pushToast('Jurnal Dihapus', 'Entri jurnal telah dihapus permanen.', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `journals/${id}`);
    }
  };

  const handleSubmitAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const calc = (ids: string[]) =>
      Math.round((ids.reduce((acc, k) => acc + (answers[k] || 1), 0) / (ids.length * 5)) * 100);
    const stressScore = calc(['q1', 'q2']);
    const socialScore = calc(['q3', 'q4']);
    const academicScore = calc(['q5', 'q6']);
    const careerScore = calc(['q7', 'q8']);

    const pairs: Array<{ cat: CounselingCategory; score: number }> = [
      { cat: 'pribadi', score: stressScore },
      { cat: 'belajar', score: academicScore },
      { cat: 'sosial', score: socialScore },
      { cat: 'karier', score: careerScore },
    ];
    pairs.sort((a, b) => b.score - a.score);
    const recommendedService = pairs[0].cat;
    const summaryLabel = `Fokus utama saat ini mengarah pada ${CATEGORY_LABELS[recommendedService]} (Indeks kebutuhan ${pairs[0].score}%).`;

    try {
      await addDoc(collection(db, 'assessments'), {
        uid: firebaseUser.uid,
        stressScore,
        academicScore,
        socialScore,
        careerScore,
        recommendedService,
        summaryLabel,
        createdAt: serverTimestamp(),
      });
      pushToast('Asesmen Selesai', 'Hasil asesmen kebutuhan layanan BK telah disimpan.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'assessments');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    try {
      const payload = {
        uid: firebaseUser.uid,
        fullName: profName.trim().slice(0, 120),
        nim: profNim.trim().slice(0, 32),
        studyProgram: profProdi.trim().slice(0, 120),
        semester: Number(profSemester),
        phone: profPhone.trim().slice(0, 32),
        emergencyContact: profEmergency.trim().slice(0, 120),
        privacyConsentAccepted: true,
        updatedAt: serverTimestamp(),
      };
      if (studentProfile) {
        await updateDoc(doc(db, 'studentProfiles', firebaseUser.uid), payload);
      } else {
        await setDoc(doc(db, 'studentProfiles', firebaseUser.uid), {
          ...payload,
          consentAcceptedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      }
      await refreshProfile();
      pushToast('Profil Disimpan', 'Data profil mahasiswa berhasil diperbarui.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `studentProfiles/${firebaseUser.uid}`);
    }
  };

  const handleExportPersonalBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      platform: 'Ruang Tumbuh – Lab BK UNUGHA',
      profile: studentProfile,
      moodTrackers: moods,
      journals,
      assessments,
      requests,
      schedules,
      followUps,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadangan-data-ruang-tumbuh-${todayDateWIB()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast('Cadangan Diunduh', 'Salinan data pribadi Anda berhasil diunduh dalam format JSON.', 'success');
  };

  const handleClearPersonalReflections = async () => {
    try {
      await Promise.all([
        ...journals.map((j) => deleteDoc(doc(db, 'journals', j.id))),
        ...moods.map((m) => deleteDoc(doc(db, 'moodTrackers', m.id))),
      ]);
      pushToast('Data Dihapus', 'Seluruh jurnal refleksi dan catatan mood pribadi telah dihapus.', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'journals/moodTrackers');
    }
  };

  const upcomingSchedules = schedules.filter(
    (s) => s.status === 'confirmed' || s.status === 'in_progress' || s.status === 'reschedule_requested'
  );
  const pastSchedules = schedules.filter((s) => s.status === 'completed' || s.status === 'cancelled');
  const displayArticles = articles.length > 0 ? articles : DEMO_ARTICLES;
  const windowMinutesBefore = siteAbout.videoWindowMinutesBefore || 15;

  const navItems: Array<{ id: StudentTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Ringkasan & Jadwal', icon: LayoutDashboard },
    { id: 'request', label: 'Ajukan Konseling', icon: FilePlus2 },
    { id: 'history', label: 'Riwayat & Tindak Lanjut', icon: History },
    { id: 'mood', label: 'Mood Tracker', icon: Smile },
    { id: 'journal', label: 'Jurnal Refleksi', icon: BookHeart },
    { id: 'assessment', label: 'Asesmen Awal', icon: ClipboardCheck },
    { id: 'articles', label: 'Artikel Edukasi', icon: Newspaper },
    { id: 'notifications', label: 'Notifikasi', icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'Profil & Privasi', icon: UserCog },
  ];

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F7F4EC]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Sidebar */}
          <aside className="lg:col-span-3 space-y-4">
            <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5 space-y-1">
              <p className="text-xs font-semibold text-[#315E4B]">Portal Mahasiswa</p>
              <h2 className="text-lg font-bold text-[#1E2B24] truncate">
                {studentProfile?.fullName || userAccount?.displayName}
              </h2>
              <p className="text-xs text-[#596B61] tabular-nums">
                {studentProfile ? `NIM ${studentProfile.nim} · ${studentProfile.studyProgram}` : 'Lengkapi profil mahasiswa Anda'}
              </p>
            </div>

            <nav className="rounded-2xl border border-[#EAE3D2] bg-white p-2 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-[#315E4B] text-white'
                        : 'text-[#3B4D43] hover:bg-[#EBF0EC] hover:text-[#315E4B]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5 truncate">
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge && item.badge > 0 ? (
                      <span
                        className={`ml-2 font-mono text-xs tabular-nums px-1.5 py-0.5 rounded ${
                          active ? 'bg-white/20 text-white' : 'bg-[#EBF0EC] text-[#315E4B]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-9 space-y-6">
            {activeTab === 'overview' && (
              <>
                <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">
                      Halo, {studentProfile?.fullName || userAccount?.displayName}
                    </h1>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Bagaimana kabarmu hari ini? Kamu memiliki ruang aman untuk bercerita dan bertumbuh di sini.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('request')}
                    className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738] whitespace-nowrap shrink-0"
                  >
                    Ajukan Konseling Baru
                  </button>
                </div>

                {/* KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Jadwal Mendatang</p>
                    <p className="mt-2 text-2xl font-bold text-[#315E4B] tabular-nums">
                      {upcomingSchedules.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Pengajuan Aktif</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">
                      {requests.filter((r) => !['completed', 'cancelled', 'rejected'].includes(r.status)).length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Sesi Selesai</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">
                      {schedules.filter((s) => s.status === 'completed').length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Jurnal Refleksi</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">
                      {journals.length}
                    </p>
                  </div>
                </div>

                {/* Upcoming Schedules with Real Video Call Entry */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#1E2B24]">Jadwal Konseling Mendatang</h2>
                    <span className="text-xs text-[#596B61]">Waktu Indonesia Barat (WIB)</span>
                  </div>

                  {loadingData ? (
                    <div className="space-y-3">
                      <div className="h-20 rounded-xl bg-[#F7F4EC] animate-pulse" />
                    </div>
                  ) : upcomingSchedules.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D4E0D5] p-6 text-center space-y-2">
                      <CalendarClock className="mx-auto h-8 w-8 text-[#A3B8A5]" />
                      <p className="text-sm font-medium text-[#1E2B24]">Belum ada jadwal konseling aktif</p>
                      <p className="text-xs text-[#596B61]">
                        Ajukan konseling agar Admin Lab BK dapat menetapkan jadwal bersama konselor yang sesuai.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {upcomingSchedules.map((sch) => {
                        const joinStatus = isScheduleJoinable(
                          sch.date,
                          sch.startTime,
                          sch.endTime,
                          sch.status,
                          sch.method,
                          windowMinutesBefore
                        );
                        return (
                          <div
                            key={sch.id}
                            className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#596B61]">
                                <span className="font-semibold text-[#315E4B]">
                                  {CATEGORY_LABELS[sch.category]}
                                </span>
                                <span>·</span>
                                <span>{sch.method === 'online' ? 'Online (Video Call)' : 'Offline (Tatap Muka)'}</span>
                                <span>·</span>
                                <span className="font-medium text-[#1E2B24]">
                                  {SCHEDULE_STATUS_LABELS[sch.status]}
                                </span>
                              </div>
                              <p className="text-base font-bold text-[#1E2B24]">
                                Konselor: {sch.counselorName}
                              </p>
                              <p className="text-sm text-[#45564D] tabular-nums">
                                {formatDateId(sch.date)} · {sch.startTime}–{sch.endTime} WIB
                                {sch.method === 'offline' && sch.locationOrRoom ? ` · ${sch.locationOrRoom}` : ''}
                              </p>
                              {!joinStatus.joinable && sch.method === 'online' && (
                                <p className="text-xs text-[#596B61]">{joinStatus.reason}</p>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              {sch.method === 'online' && (
                                <button
                                  type="button"
                                  disabled={!joinStatus.joinable}
                                  onClick={() => onJoinVideoCall(sch)}
                                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap ${
                                    joinStatus.joinable
                                      ? 'bg-[#315E4B] text-white hover:bg-[#244738]'
                                      : 'bg-[#EAE3D2] text-[#7A887F] cursor-not-allowed'
                                  }`}
                                >
                                  <Video className="h-4 w-4" />
                                  <span>Gabung Konseling</span>
                                </button>
                              )}
                              {sch.status === 'confirmed' && (
                                <button
                                  type="button"
                                  onClick={() => setRescheduleTarget(sch)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#C6D4C8] bg-white px-3.5 py-2.5 text-xs font-medium text-[#315E4B] hover:bg-[#EBF0EC]"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  <span>Usul Ubah Jadwal</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Request Status Tracker */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Status Pengajuan Konseling</h2>
                  {requests.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada riwayat pengajuan konseling.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                            <th className="py-2.5 pr-4 font-semibold">Bidang</th>
                            <th className="py-2.5 pr-4 font-semibold">Metode</th>
                            <th className="py-2.5 pr-4 font-semibold">Preferensi</th>
                            <th className="py-2.5 pr-4 font-semibold">Konselor</th>
                            <th className="py-2.5 pr-4 font-semibold">Status</th>
                            <th className="py-2.5 font-semibold text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAE3D2]">
                          {requests.map((r) => (
                            <tr key={r.id}>
                              <td className="py-3 pr-4 font-medium text-[#1E2B24]">
                                {CATEGORY_LABELS[r.category]}
                              </td>
                              <td className="py-3 pr-4 capitalize text-[#45564D]">{r.method}</td>
                              <td className="py-3 pr-4 text-[#45564D] tabular-nums">
                                {r.preferredDate} · {r.preferredTime}
                              </td>
                              <td className="py-3 pr-4 text-[#45564D]">
                                {r.assignedCounselorName || 'Menunggu penugasan'}
                              </td>
                              <td className="py-3 pr-4">
                                <span className="font-medium text-[#315E4B]">
                                  {REQUEST_STATUS_LABELS[r.status]}
                                </span>
                                {r.status === 'rejected' && r.rejectionReason && (
                                  <p className="text-xs text-red-700 mt-0.5">{r.rejectionReason}</p>
                                )}
                              </td>
                              <td className="py-3 text-right">
                                {(r.status === 'new' || r.status === 'verifying') && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelRequest(r.id)}
                                    className="text-xs font-medium text-red-700 hover:underline"
                                  >
                                    Batalkan
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </>
            )}

            {/* Formulir Pengajuan Konseling */}
            {activeTab === 'request' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-6">
                <div>
                  <h1 className="text-2xl font-bold text-[#1E2B24]">Formulir Pengajuan Konseling</h1>
                  <p className="mt-1 text-sm text-[#45564D]">
                    Isi formulir berikut untuk mengajukan sesi konseling gratis di Laboratorium BK UNUGHA. Gambaran permasalahanmu hanya dapat dilihat oleh konselor yang ditugaskan.
                  </p>
                </div>

                {reqSuccessBanner && (
                  <div className="flex items-start gap-3 rounded-xl border border-[#A3B8A5] bg-[#EBF0EC] p-4 text-sm text-[#1E2B24]">
                    <CheckCircle2 className="h-5 w-5 text-[#315E4B] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-[#315E4B]">Pengajuan Berhasil Diterima</p>
                      <p className="mt-0.5 text-[#35443C]">
                        Pengajuan konseling Anda telah kami terima dan sedang menunggu konfirmasi serta penjadwalan oleh Admin Lab BK UNUGHA.
                      </p>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmitRequest} className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Nama Mahasiswa
                      </label>
                      <input
                        type="text"
                        required
                        value={reqName}
                        onChange={(e) => setReqName(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm focus:border-[#315E4B] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">NIM</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: 24CI10027"
                        value={reqNim}
                        onChange={(e) => setReqNim(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#315E4B] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Program Studi
                      </label>
                      <select
                        value={reqProdi}
                        onChange={(e) => setReqProdi(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm focus:border-[#315E4B] focus:outline-none"
                      >
                        {STUDY_PROGRAMS_UNUGHA.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Semester
                      </label>
                      <select
                        value={reqSemester}
                        onChange={(e) => setReqSemester(Number(e.target.value))}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums focus:border-[#315E4B] focus:outline-none"
                      >
                        {Array.from({ length: 14 }, (_, i) => i + 1).map((s) => (
                          <option key={s} value={s}>
                            Semester {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Pilihan Bidang Konseling
                      </label>
                      <select
                        value={reqCategory}
                        onChange={(e) => setReqCategory(e.target.value as CounselingCategory)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm focus:border-[#315E4B] focus:outline-none"
                      >
                        <option value="pribadi">Konseling Pribadi</option>
                        <option value="sosial">Konseling Sosial</option>
                        <option value="belajar">Konseling Belajar</option>
                        <option value="karier">Konseling Karier</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Metode Konseling
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(['online', 'offline'] as CounselingMethod[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setReqMethod(m)}
                            className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${
                              reqMethod === m
                                ? 'border-[#315E4B] bg-[#315E4B] text-white'
                                : 'border-[#D4E0D5] bg-[#FAF8F3] text-[#35443C]'
                            }`}
                          >
                            {m === 'online' ? 'Online (Video Call)' : 'Offline (Lab BK)'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Preferensi Tanggal
                      </label>
                      <input
                        type="date"
                        required
                        min={todayDateWIB()}
                        value={reqDate}
                        onChange={(e) => setReqDate(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums focus:border-[#315E4B] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Preferensi Waktu (WIB)
                      </label>
                      <input
                        type="time"
                        required
                        value={reqTime}
                        onChange={(e) => setReqTime(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums focus:border-[#315E4B] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                      Gambaran Singkat Permasalahan (Terlindungi & Privat)
                    </label>
                    <textarea
                      rows={4}
                      required
                      minLength={10}
                      maxLength={3000}
                      placeholder="Ceritakan secara singkat hal yang ingin kamu diskusikan bersama konselor..."
                      value={reqSummary}
                      onChange={(e) => setReqSummary(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm focus:border-[#315E4B] focus:outline-none"
                    />
                    <p className="mt-1 text-xs text-[#596B61]">
                      Admin hanya melihat data administratif (nama, NIM, prodi, bidang, metode). Isi ceritamu hanya terbaca oleh konselor yang ditugaskan.
                    </p>
                  </div>

                  <label className="flex items-start gap-3 rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reqConsent}
                      onChange={(e) => setReqConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[#315E4B]"
                    />
                    <span className="text-xs text-[#35443C] leading-relaxed">
                      Saya menyetujui pengumpulan data administratif dan menjaga etika kerahasiaan sesi sesuai{' '}
                      <button
                        type="button"
                        onClick={onOpenPrivacyModal}
                        className="font-semibold text-[#315E4B] underline"
                      >
                        Kebijakan Privasi & Ketentuan Penggunaan Ruang Tumbuh
                      </button>
                      .
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submittingReq}
                    className="rounded-xl bg-[#315E4B] px-6 py-3 text-sm font-semibold text-white hover:bg-[#244738] disabled:opacity-60"
                  >
                    {submittingReq ? 'Mengirim Pengajuan...' : 'Kirim Pengajuan Konseling'}
                  </button>
                </form>
              </section>
            )}

            {/* Riwayat & Rencana Tindak Lanjut */}
            {activeTab === 'history' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-xl font-bold text-[#1E2B24]">Rencana Tindak Lanjut dari Konselor</h2>
                  {followUps.length === 0 ? (
                    <p className="text-sm text-[#596B61]">
                      Belum ada rencana tindak lanjut dari konselor. Tindak lanjut akan muncul setelah sesi konseling selesai.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {followUps.map((f) => (
                        <div key={f.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-base font-bold text-[#1E2B24]">{f.planTitle}</h3>
                            <span className="text-xs font-semibold text-[#315E4B]">
                              {f.status === 'selesai' ? 'Selesai Dilaksanakan' : 'Aktif'}
                            </span>
                          </div>
                          <p className="text-xs text-[#596B61]">
                            Konselor: {f.counselorName} {f.targetDate ? `· Target: ${f.targetDate}` : ''}
                          </p>
                          <p className="text-sm text-[#35443C] whitespace-pre-line">{f.actionItems}</p>
                          {f.status === 'aktif' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDoc(doc(db, 'followUps', f.id), {
                                  status: 'selesai',
                                  updatedAt: serverTimestamp(),
                                })
                              }
                              className="mt-2 rounded-lg bg-[#315E4B] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-[#244738]"
                            >
                              Tandai Selesai
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-xl font-bold text-[#1E2B24]">Riwayat Sesi Konseling</h2>
                  {pastSchedules.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada riwayat sesi yang selesai atau dibatalkan.</p>
                  ) : (
                    <div className="divide-y divide-[#EAE3D2]">
                      {pastSchedules.map((s) => (
                        <div key={s.id} className="py-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                          <div>
                            <p className="font-semibold text-[#1E2B24]">
                              {CATEGORY_LABELS[s.category]} · {s.counselorName}
                            </p>
                            <p className="text-xs text-[#596B61] tabular-nums">
                              {formatDateId(s.date)} · {s.startTime}–{s.endTime} WIB · {s.method}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-[#315E4B]">
                            {SCHEDULE_STATUS_LABELS[s.status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Mood Tracker */}
            {activeTab === 'mood' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">Mood Tracker Harian</h1>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Kenali pola perasaanmu dari hari ke hari secara privat.
                    </p>
                  </div>

                  <form onSubmit={handleSaveMood} className="space-y-5">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                      {MOOD_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setMoodType(opt.value)}
                          className={`rounded-xl border p-3 text-center transition-colors ${
                            moodType === opt.value
                              ? 'border-[#315E4B] bg-[#EBF0EC]'
                              : 'border-[#EAE3D2] bg-[#FAF8F3] hover:border-[#A3B8A5]'
                          }`}
                        >
                          <div className="text-2xl">{opt.emoji}</div>
                          <div className="mt-1 text-xs font-medium text-[#1E2B24]">{opt.label}</div>
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1">
                        Intensitas Perasaan ({moodIntensity}/5)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={moodIntensity}
                        onChange={(e) => setMoodIntensity(Number(e.target.value))}
                        className="w-full accent-[#315E4B]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Catatan Singkat (Opsional)
                      </label>
                      <input
                        type="text"
                        maxLength={500}
                        placeholder="Apa yang memicu perasaanmu hari ini?"
                        value={moodNote}
                        onChange={(e) => setMoodNote(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm focus:border-[#315E4B] focus:outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      Simpan Mood Hari Ini
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Riwayat Mood Tracker</h2>
                  {moods.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada catatan mood yang tersimpan.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {moods.slice(0, 14).map((m) => {
                        const info = MOOD_OPTIONS.find((o) => o.value === m.mood);
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] px-4 py-3 text-sm"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{info?.emoji || '🙂'}</span>
                              <div>
                                <p className="font-semibold text-[#1E2B24]">
                                  {info?.label || m.mood} · Intensitas {m.intensity}/5
                                </p>
                                {m.note && <p className="text-xs text-[#45564D]">{m.note}</p>}
                              </div>
                            </div>
                            <span className="text-xs text-[#596B61] tabular-nums">{m.date}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Jurnal Refleksi Diri */}
            {activeTab === 'journal' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">Jurnal Refleksi Diri</h1>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Ruang menulis privat yang hanya dapat dibaca oleh dirimu sendiri.
                    </p>
                  </div>

                  <form onSubmit={handleSaveJournal} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Pertanyaan Pemantik
                      </label>
                      <select
                        value={journalPrompt}
                        onChange={(e) => setJournalPrompt(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      >
                        {REFLECTION_PROMPTS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Judul Catatan
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={200}
                        placeholder="Beri judul untuk refleksimu hari ini..."
                        value={journalTitle}
                        onChange={(e) => setJournalTitle(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Isi Refleksi
                      </label>
                      <textarea
                        rows={5}
                        required
                        maxLength={6000}
                        placeholder="Tuliskan pikiran dan perasaanmu dengan jujur..."
                        value={journalContent}
                        onChange={(e) => setJournalContent(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="submit"
                        className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                      >
                        {editingJournalId ? 'Simpan Perubahan' : 'Simpan Jurnal'}
                      </button>
                      {editingJournalId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingJournalId(null);
                            setJournalTitle('');
                            setJournalContent('');
                          }}
                          className="rounded-xl border border-[#D4E0D5] px-4 py-2.5 text-sm text-[#45564D]"
                        >
                          Batal Edit
                        </button>
                      )}
                    </div>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Arsip Jurnal Pribadi</h2>
                  {journals.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada entri jurnal refleksi diri.</p>
                  ) : (
                    <div className="space-y-4">
                      {journals.map((j) => (
                        <div key={j.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 space-y-2">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="text-base font-bold text-[#1E2B24]">{j.title}</h3>
                              <p className="text-xs text-[#596B61]">{formatTimestampId(j.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingJournalId(j.id);
                                  setJournalTitle(j.title);
                                  setJournalContent(j.content);
                                  if (j.reflectionPrompt) setJournalPrompt(j.reflectionPrompt);
                                }}
                                className="font-medium text-[#315E4B] hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteJournal(j.id)}
                                className="font-medium text-red-700 hover:underline"
                              >
                                Hapus
                              </button>
                            </div>
                          </div>
                          {j.reflectionPrompt && (
                            <p className="text-xs italic text-[#596B61]">{j.reflectionPrompt}</p>
                          )}
                          <p className="text-sm text-[#35443C] whitespace-pre-line">{j.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Asesmen Awal Non-Diagnostik */}
            {activeTab === 'assessment' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">Asesmen Awal Kebutuhan Layanan BK</h1>
                    <p className="mt-1 text-sm text-[#45564D]">
                      Asesmen ini bersifat non-diagnostik dan bertujuan membantumu memetakan bidang konseling yang paling relevan saat ini (Skala 1 = Tidak Pernah, 5 = Sangat Sering).
                    </p>
                  </div>

                  <form onSubmit={handleSubmitAssessment} className="space-y-4">
                    {ASSESSMENT_QUESTIONS.map((q, idx) => (
                      <div key={q.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 space-y-3">
                        <p className="text-sm font-medium text-[#1E2B24]">
                          {idx + 1}. {q.text}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[1, 2, 3, 4, 5].map((score) => (
                            <button
                              key={score}
                              type="button"
                              onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: score }))}
                              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold tabular-nums transition-colors ${
                                answers[q.id] === score
                                  ? 'border-[#315E4B] bg-[#315E4B] text-white'
                                  : 'border-[#D4E0D5] bg-white text-[#35443C]'
                              }`}
                            >
                              {score}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-6 py-3 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      Lihat Rekomendasi Layanan
                    </button>
                  </form>
                </section>

                {assessments.length > 0 && (
                  <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                    <h2 className="text-lg font-bold text-[#1E2B24]">Hasil Asesmen Terakhir</h2>
                    <div className="rounded-xl border border-[#A3B8A5] bg-[#EBF0EC] p-5 space-y-3">
                      <p className="text-sm font-semibold text-[#315E4B]">{assessments[0].summaryLabel}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>Pribadi: <strong className="tabular-nums">{assessments[0].stressScore}%</strong></div>
                        <div>Belajar: <strong className="tabular-nums">{assessments[0].academicScore}%</strong></div>
                        <div>Sosial: <strong className="tabular-nums">{assessments[0].socialScore}%</strong></div>
                        <div>Karier: <strong className="tabular-nums">{assessments[0].careerScore}%</strong></div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setReqCategory(assessments[0].recommendedService);
                          setActiveTab('request');
                        }}
                        className="rounded-lg bg-[#315E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#244738]"
                      >
                        Ajukan {CATEGORY_LABELS[assessments[0].recommendedService]}
                      </button>
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Artikel Edukasi BK */}
            {activeTab === 'articles' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                <h1 className="text-2xl font-bold text-[#1E2B24]">Artikel Edukasi Bimbingan & Konseling</h1>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {displayArticles.map((art) => (
                    <div key={art.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 space-y-3">
                      <p className="text-xs font-semibold text-[#315E4B]">
                        {art.category} · {art.readMinutes} menit baca
                      </p>
                      <h3 className="text-lg font-bold text-[#1E2B24]">{art.title}</h3>
                      <p className="text-sm text-[#45564D]">{art.excerpt}</p>
                      <button
                        type="button"
                        onClick={() => setReadingArticle(art)}
                        className="text-sm font-semibold text-[#315E4B] hover:underline"
                      >
                        Baca Artikel
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Notifikasi */}
            {activeTab === 'notifications' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                <h1 className="text-2xl font-bold text-[#1E2B24]">Notifikasi</h1>
                {notifications.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada notifikasi baru.</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
                          n.isRead ? 'border-[#EAE3D2] bg-white' : 'border-[#A3B8A5] bg-[#EBF0EC]/60'
                        }`}
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-bold text-[#1E2B24]">{n.title}</p>
                          <p className="text-sm text-[#45564D]">{n.message}</p>
                          <p className="text-xs text-[#596B61]">{formatTimestampId(n.createdAt)}</p>
                        </div>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(n.id)}
                            className="text-xs font-semibold text-[#315E4B] hover:underline shrink-0"
                          >
                            Tandai Dibaca
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Profil & Privasi */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <h1 className="text-2xl font-bold text-[#1E2B24]">Profil Mahasiswa</h1>
                  <form onSubmit={handleSaveProfile} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Nama Lengkap</label>
                        <input
                          type="text"
                          required
                          value={profName}
                          onChange={(e) => setProfName(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">NIM</label>
                        <input
                          type="text"
                          required
                          value={profNim}
                          onChange={(e) => setProfNim(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm font-mono tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Program Studi</label>
                        <select
                          value={profProdi}
                          onChange={(e) => setProfProdi(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          {STUDY_PROGRAMS_UNUGHA.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Semester</label>
                        <select
                          value={profSemester}
                          onChange={(e) => setProfSemester(Number(e.target.value))}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums"
                        >
                          {Array.from({ length: 14 }, (_, i) => i + 1).map((s) => (
                            <option key={s} value={s}>
                              Semester {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Nomor WhatsApp (Opsional)</label>
                        <input
                          type="text"
                          value={profPhone}
                          onChange={(e) => setProfPhone(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Kontak Darurat (Opsional)</label>
                        <input
                          type="text"
                          value={profEmergency}
                          onChange={(e) => setProfEmergency(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      Simpan Perubahan Profil
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <div className="flex items-center gap-2 text-[#315E4B]">
                    <ShieldCheck className="h-5 w-5" />
                    <h2 className="text-lg font-bold">Kendali Data, Pencadangan & Retensi</h2>
                  </div>
                  <p className="text-sm text-[#45564D]">
                    Sesuai kebijakan retensi data Lab BK UNUGHA ({siteAbout.retentionDays || 365} hari), Anda dapat mengunduh cadangan data refleksi pribadi atau menghapus entri jurnal & mood Anda kapan saja.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleExportPersonalBackup}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#C6D4C8] bg-[#FAF8F3] px-4 py-2.5 text-sm font-medium text-[#315E4B] hover:bg-[#EBF0EC]"
                    >
                      <Download className="h-4 w-4" />
                      <span>Unduh Cadangan Data (JSON)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleClearPersonalReflections}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span>Hapus Jurnal & Mood Pribadi</span>
                    </button>
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#1E2B24]">Usulkan Perubahan Jadwal</h3>
            <p className="text-xs text-[#596B61]">
              Jadwal saat ini: {formatDateId(rescheduleTarget.date)} · {rescheduleTarget.startTime} WIB
            </p>
            <textarea
              rows={3}
              required
              placeholder="Tuliskan alasan dan usulan waktu pengganti..."
              value={rescheduleNote}
              onChange={(e) => setRescheduleNote(e.target.value)}
              className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                className="rounded-lg border border-[#EAE3D2] px-4 py-2 text-sm text-[#45564D]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRequestReschedule}
                className="rounded-lg bg-[#315E4B] px-4 py-2 text-sm font-semibold text-white"
              >
                Kirim Usulan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Article Reader Modal */}
      {readingArticle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#315E4B]">
                  {readingArticle.category} · {readingArticle.readMinutes} menit baca
                </p>
                <h3 className="mt-1 text-xl font-bold text-[#1E2B24]">{readingArticle.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setReadingArticle(null)}
                className="rounded-lg border border-[#EAE3D2] px-3 py-1.5 text-xs font-medium text-[#45564D]"
              >
                Tutup
              </button>
            </div>
            <p className="text-sm text-[#35443C] whitespace-pre-line leading-relaxed">
              {readingArticle.content}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
