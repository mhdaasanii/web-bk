import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ClipboardList,
  CalendarClock,
  Lock,
  History,
  Bell,
  UserCog,
  Video,
  RefreshCw,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { formatDateId, formatTimestampId, isScheduleJoinable } from '../lib/timeWindow.ts';
import {
  CATEGORY_LABELS,
  CounselingRequest,
  CounselingSchedule,
  FollowUp,
  PrivateNote,
  REQUEST_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
} from '../types/index.ts';

interface CounselorDashboardProps {
  onJoinVideoCall: (schedule: CounselingSchedule) => void;
}

type CounselorTab =
  | 'overview'
  | 'requests'
  | 'notes'
  | 'history'
  | 'notifications'
  | 'profile';

export const CounselorDashboard: React.FC<CounselorDashboardProps> = ({ onJoinVideoCall }) => {
  const {
    firebaseUser,
    userAccount,
    counselorProfile,
    notifications,
    unreadCount,
    siteAbout,
    pushToast,
    refreshProfile,
    markNotificationRead,
    sendNotification,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<CounselorTab>('overview');
  const [requests, setRequests] = useState<CounselingRequest[]>([]);
  const [schedules, setSchedules] = useState<CounselingSchedule[]>([]);
  const [privateNotes, setPrivateNotes] = useState<PrivateNote[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  // Private story viewer modal
  const [storyModal, setStoryModal] = useState<{ request: CounselingRequest; story: string } | null>(null);

  // Reschedule modal
  const [rescheduleTarget, setRescheduleTarget] = useState<CounselingSchedule | null>(null);
  const [rescheduleNote, setRescheduleNote] = useState('');

  // Private note form
  const [noteScheduleId, setNoteScheduleId] = useState('');
  const [noteSummary, setNoteSummary] = useState('');
  const [noteObservations, setNoteObservations] = useState('');
  const [noteFollowUpInternal, setNoteFollowUpInternal] = useState('');
  const [noteNextDate, setNoteNextDate] = useState('');
  const [noteRisk, setNoteRisk] = useState<'rendah' | 'sedang' | 'tinggi'>('rendah');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  // Student-facing Follow-up form
  const [fuScheduleId, setFuScheduleId] = useState('');
  const [fuTitle, setFuTitle] = useState('');
  const [fuItems, setFuItems] = useState('');
  const [fuTargetDate, setFuTargetDate] = useState('');

  // Profile state
  const [profName, setProfName] = useState(counselorProfile?.fullName || userAccount?.displayName || '');
  const [profTitle, setProfTitle] = useState(counselorProfile?.title || 'Konselor Lab BK UNUGHA');
  const [profBio, setProfBio] = useState(counselorProfile?.bio || '');
  const [profSpecs, setProfSpecs] = useState<string[]>(counselorProfile?.specializations || ['Pribadi']);
  const [profAvailabilityText, setProfAvailabilityText] = useState(
    (counselorProfile?.availability || ['Senin 09:00-12:00']).join('\n')
  );

  useEffect(() => {
    if (counselorProfile) {
      setProfName(counselorProfile.fullName);
      setProfTitle(counselorProfile.title);
      setProfBio(counselorProfile.bio || '');
      setProfSpecs(counselorProfile.specializations || ['Pribadi']);
      setProfAvailabilityText((counselorProfile.availability || []).join('\n'));
    }
  }, [counselorProfile]);

  useEffect(() => {
    if (!firebaseUser) return;
    const uid = firebaseUser.uid;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(
        query(collection(db, 'counselingRequests'), where('assignedCounselorUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingRequest, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setRequests(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'counselingSchedules'), where('counselorUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingSchedule, 'id'>) }))
            .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
          setSchedules(list);
          if (list.length > 0 && !noteScheduleId) {
            setNoteScheduleId(list[0].id);
            setFuScheduleId(list[0].id);
          }
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'privateNotes'), where('counselorUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<PrivateNote, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setPrivateNotes(list);
        }
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, 'followUps'), where('counselorUid', '==', uid)),
        (snap) => {
          const list = snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<FollowUp, 'id'>) }))
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
          setFollowUps(list);
        }
      )
    );

    return () => unsubs.forEach((u) => u());
  }, [firebaseUser]);

  const handleOpenPrivateStory = async (req: CounselingRequest) => {
    try {
      const snap = await getDoc(doc(db, 'counselingRequests', req.id, 'privateDetail', 'story'));
      const story = snap.exists()
        ? (snap.data().issueSummary as string)
        : 'Mahasiswa tidak menyertakan detail tambahan.';
      setStoryModal({ request: req, story });
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `counselingRequests/${req.id}/privateDetail/story`);
    }
  };

  const handleUpdateScheduleStatus = async (sch: CounselingSchedule, newStatus: CounselingSchedule['status']) => {
    try {
      await updateDoc(doc(db, 'counselingSchedules', sch.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      if (newStatus === 'completed') {
        await updateDoc(doc(db, 'counselingRequests', sch.requestId), {
          status: 'completed',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
      await sendNotification({
        targetUid: sch.studentUid,
        targetRole: 'student',
        title: `Status Sesi Diperbarui`,
        message: `Sesi ${CATEGORY_LABELS[sch.category]} pada ${sch.date} kini berstatus: ${SCHEDULE_STATUS_LABELS[newStatus]}.`,
        type: 'schedule',
      });
      pushToast('Status Diperbarui', `Jadwal berhasil diubah menjadi ${SCHEDULE_STATUS_LABELS[newStatus]}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingSchedules/${sch.id}`);
    }
  };

  const handleProposeReschedule = async () => {
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
        title: 'Usulan Perubahan Jadwal oleh Konselor',
        message: `${rescheduleTarget.counselorName} mengusulkan ubah jadwal sesi ${rescheduleTarget.studentName}: ${rescheduleNote.trim()}`,
        type: 'schedule',
      });
      await sendNotification({
        targetUid: rescheduleTarget.studentUid,
        targetRole: 'student',
        title: 'Konselor Mengusulkan Perubahan Jadwal',
        message: `Konselor ${rescheduleTarget.counselorName} mengusulkan penjadwalan ulang (${rescheduleNote.trim()}). Admin akan segera memperbarui jadwal.`,
        type: 'schedule',
      });
      setRescheduleTarget(null);
      setRescheduleNote('');
      pushToast('Usulan Terkirim', 'Usulan perubahan jadwal dikirim ke Admin dan Mahasiswa.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingSchedules/${rescheduleTarget.id}`);
    }
  };

  const handleSavePrivateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !noteSummary.trim()) return;
    const targetSch = schedules.find((s) => s.id === noteScheduleId);
    if (!targetSch) {
      pushToast('Pilih Jadwal Sesi', 'Silakan pilih jadwal sesi terkait sebelum menyimpan catatan.', 'error');
      return;
    }

    try {
      if (editingNoteId) {
        await updateDoc(doc(db, 'privateNotes', editingNoteId), {
          sessionSummary: noteSummary.trim().slice(0, 5000),
          observations: noteObservations.trim().slice(0, 5000),
          followUpPlan: noteFollowUpInternal.trim().slice(0, 3000),
          nextActionDate: noteNextDate,
          riskLevel: noteRisk,
          updatedAt: serverTimestamp(),
        });
        setEditingNoteId(null);
        pushToast('Catatan Diperbarui', 'Catatan konseling privat berhasil diperbarui.', 'success');
      } else {
        await addDoc(collection(db, 'privateNotes'), {
          scheduleId: targetSch.id,
          requestId: targetSch.requestId,
          studentUid: targetSch.studentUid,
          studentName: targetSch.studentName,
          counselorUid: firebaseUser.uid,
          counselorName: counselorProfile?.fullName || userAccount?.displayName || 'Konselor',
          sessionSummary: noteSummary.trim().slice(0, 5000),
          observations: noteObservations.trim().slice(0, 5000),
          followUpPlan: noteFollowUpInternal.trim().slice(0, 3000),
          nextActionDate: noteNextDate,
          riskLevel: noteRisk,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        pushToast('Catatan Privat Disimpan', 'Catatan tersimpan aman dan hanya dapat diakses oleh Anda.', 'success');
      }
      setNoteSummary('');
      setNoteObservations('');
      setNoteFollowUpInternal('');
      setNoteNextDate('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'privateNotes');
    }
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !fuTitle.trim() || !fuItems.trim()) return;
    const targetSch = schedules.find((s) => s.id === fuScheduleId);
    if (!targetSch) return;

    try {
      await addDoc(collection(db, 'followUps'), {
        scheduleId: targetSch.id,
        studentUid: targetSch.studentUid,
        counselorUid: firebaseUser.uid,
        counselorName: counselorProfile?.fullName || userAccount?.displayName || 'Konselor',
        planTitle: fuTitle.trim().slice(0, 200),
        actionItems: fuItems.trim().slice(0, 3000),
        targetDate: fuTargetDate,
        status: 'aktif',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await sendNotification({
        targetUid: targetSch.studentUid,
        targetRole: 'student',
        title: 'Rencana Tindak Lanjut Baru',
        message: `${targetSch.counselorName} membagikan rencana tindak lanjut: "${fuTitle.trim()}".`,
        type: 'session',
      });
      setFuTitle('');
      setFuItems('');
      setFuTargetDate('');
      pushToast('Tindak Lanjut Dibagikan', 'Rencana tindak lanjut berhasil dikirim ke dashboard mahasiswa.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'followUps');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    const availability = profAvailabilityText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 28);

    try {
      const payload = {
        uid: firebaseUser.uid,
        fullName: profName.trim().slice(0, 120),
        title: profTitle.trim().slice(0, 120),
        specializations: profSpecs.length > 0 ? profSpecs : ['Pribadi'],
        bio: profBio.trim().slice(0, 1000),
        photoUrl: counselorProfile?.photoUrl || userAccount?.photoUrl || '',
        isActive: true,
        availability: availability.length > 0 ? availability : ['Senin 09:00-12:00'],
        maxWeeklySessions: counselorProfile?.maxWeeklySessions || 12,
        updatedAt: serverTimestamp(),
      };
      if (counselorProfile) {
        await updateDoc(doc(db, 'counselorProfiles', firebaseUser.uid), payload);
      } else {
        await setDoc(doc(db, 'counselorProfiles', firebaseUser.uid), {
          ...payload,
          createdAt: serverTimestamp(),
        });
      }
      await refreshProfile();
      pushToast('Profil Konselor Disimpan', 'Data profil & ketersediaan jadwal berhasil diperbarui.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `counselorProfiles/${firebaseUser.uid}`);
    }
  };

  const activeSchedules = schedules.filter((s) => s.status !== 'completed' && s.status !== 'cancelled');
  const pastSchedules = schedules.filter((s) => s.status === 'completed' || s.status === 'cancelled');
  const windowMinutesBefore = siteAbout.videoWindowMinutesBefore || 15;

  const navItems: Array<{ id: CounselorTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Jadwal & Sesi Aktif', icon: CalendarClock },
    { id: 'requests', label: 'Pengajuan Ditugaskan', icon: ClipboardList },
    { id: 'notes', label: 'Catatan Privat & Tindak Lanjut', icon: Lock },
    { id: 'history', label: 'Riwayat Pelayanan', icon: History },
    { id: 'notifications', label: 'Notifikasi', icon: Bell, badge: unreadCount },
    { id: 'profile', label: 'Profil & Ketersediaan', icon: UserCog },
  ];

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F7F4EC]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3 space-y-4">
            <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5 space-y-1">
              <p className="text-xs font-semibold text-[#315E4B]">Portal Konselor Lab BK</p>
              <h2 className="text-lg font-bold text-[#1E2B24] truncate">
                {counselorProfile?.fullName || userAccount?.displayName}
              </h2>
              <p className="text-xs text-[#596B61]">
                {counselorProfile?.title || 'Konselor UNUGHA'}
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
                      <span className="ml-2 font-mono text-xs tabular-nums px-1.5 py-0.5 rounded bg-[#EBF0EC] text-[#315E4B]">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="lg:col-span-9 space-y-6">
            {activeTab === 'overview' && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Jadwal Aktif</p>
                    <p className="mt-2 text-2xl font-bold text-[#315E4B] tabular-nums">{activeSchedules.length}</p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Pengajuan Ditugaskan</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">{requests.length}</p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Sesi Selesai</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">
                      {schedules.filter((s) => s.status === 'completed').length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                    <p className="text-xs text-[#596B61]">Catatan Privat</p>
                    <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">{privateNotes.length}</p>
                  </div>
                </div>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h1 className="text-xl font-bold text-[#1E2B24]">Jadwal Konseling Mendatang & Aktif</h1>
                  {activeSchedules.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada jadwal sesi aktif yang ditugaskan kepada Anda.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeSchedules.map((sch) => {
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
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-[#596B61]">
                                <span className="font-semibold text-[#315E4B]">{CATEGORY_LABELS[sch.category]}</span>
                                <span>·</span>
                                <span>{sch.method === 'online' ? 'Online (Video Call)' : 'Offline (Tatap Muka)'}</span>
                                <span>·</span>
                                <span className="font-semibold text-[#1E2B24]">{SCHEDULE_STATUS_LABELS[sch.status]}</span>
                              </div>
                              <p className="text-base font-bold text-[#1E2B24]">
                                {sch.studentName} {sch.nim ? `(${sch.nim})` : ''}
                              </p>
                              <p className="text-sm text-[#45564D] tabular-nums">
                                {formatDateId(sch.date)} · {sch.startTime}–{sch.endTime} WIB
                                {sch.locationOrRoom ? ` · ${sch.locationOrRoom}` : ''}
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
                                  className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                                    joinStatus.joinable
                                      ? 'bg-[#315E4B] text-white hover:bg-[#244738]'
                                      : 'bg-[#EAE3D2] text-[#7A887F] cursor-not-allowed'
                                  }`}
                                >
                                  <Video className="h-4 w-4" />
                                  <span>Gabung Konseling</span>
                                </button>
                              )}
                              {sch.method === 'offline' && sch.status === 'confirmed' && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateScheduleStatus(sch, 'completed')}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#315E4B] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#244738]"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  <span>Tandai Selesai</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setRescheduleTarget(sch)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-[#C6D4C8] bg-white px-3.5 py-2 text-xs font-medium text-[#315E4B] hover:bg-[#EBF0EC]"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                <span>Usul Ubah Jadwal</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            {activeTab === 'requests' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                <h1 className="text-xl font-bold text-[#1E2B24]">Daftar Pengajuan Ditugaskan</h1>
                {requests.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada pengajuan konseling yang ditugaskan kepada Anda.</p>
                ) : (
                  <div className="space-y-3">
                    {requests.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <p className="text-xs font-semibold text-[#315E4B]">
                            {CATEGORY_LABELS[r.category]} · {r.method.toUpperCase()} · {REQUEST_STATUS_LABELS[r.status]}
                          </p>
                          <h3 className="text-base font-bold text-[#1E2B24]">
                            {r.studentName} ({r.nim})
                          </h3>
                          <p className="text-xs text-[#596B61] tabular-nums">
                            {r.studyProgram} · Semester {r.semester} · Preferensi {r.preferredDate} {r.preferredTime} WIB
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenPrivateStory(r)}
                          className="inline-flex items-center gap-2 rounded-lg bg-[#315E4B] px-4 py-2 text-xs font-semibold text-white hover:bg-[#244738]"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Baca Keluhan Pribadi</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'notes' && (
              <div className="space-y-6">
                {/* Strictly Private Counseling Notes */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <div className="flex items-start gap-3">
                    <Lock className="h-5 w-5 text-[#315E4B] shrink-0 mt-0.5" />
                    <div>
                      <h1 className="text-xl font-bold text-[#1E2B24]">Catatan Konseling Privat (Terkunci Peran Konselor)</h1>
                      <p className="text-xs text-[#596B61] mt-1">
                        Catatan ini terisolasi pada tingkat keamanan database dan hanya dapat dibaca serta diubah oleh konselor yang membuatnya. Admin tidak memiliki akses ke catatan ini.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSavePrivateNote} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Sesi Konseling Terkait</label>
                        <select
                          value={noteScheduleId}
                          onChange={(e) => setNoteScheduleId(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          {schedules.length === 0 ? (
                            <option value="">Belum ada jadwal</option>
                          ) : (
                            schedules.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.studentName} · {s.date} ({s.startTime})
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Tingkat Perhatian / Risiko</label>
                        <select
                          value={noteRisk}
                          onChange={(e) => setNoteRisk(e.target.value as 'rendah' | 'sedang' | 'tinggi')}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          <option value="rendah">Rendah (Pendampingan Rutin)</option>
                          <option value="sedang">Sedang (Perlu Pemantauan Berkala)</option>
                          <option value="tinggi">Tinggi (Prioritas Tindak Lanjut)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Ringkasan Sesi</label>
                      <textarea
                        rows={3}
                        required
                        value={noteSummary}
                        onChange={(e) => setNoteSummary(e.target.value)}
                        placeholder="Ringkasan dinamika sesi konseling..."
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Observasi Klinis / Non-Klinis Konselor</label>
                      <textarea
                        rows={3}
                        value={noteObservations}
                        onChange={(e) => setNoteObservations(e.target.value)}
                        placeholder="Catatan observasi emosi, kognisi, dan respons mahasiswa..."
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Rencana Sesi Berikutnya (Internal)</label>
                        <input
                          type="text"
                          value={noteFollowUpInternal}
                          onChange={(e) => setNoteFollowUpInternal(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Tanggal Tindak Lanjut</label>
                        <input
                          type="date"
                          value={noteNextDate}
                          onChange={(e) => setNoteNextDate(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={schedules.length === 0}
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738] disabled:opacity-50"
                    >
                      {editingNoteId ? 'Perbarui Catatan Privat' : 'Simpan Catatan Privat'}
                    </button>
                  </form>

                  <div className="pt-4 border-t border-[#EAE3D2] space-y-3">
                    <h3 className="text-base font-bold text-[#1E2B24]">Daftar Catatan Privat Anda</h3>
                    {privateNotes.length === 0 ? (
                      <p className="text-sm text-[#596B61]">Belum ada catatan privat tersimpan.</p>
                    ) : (
                      privateNotes.map((n) => (
                        <div key={n.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 space-y-1.5 text-sm">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#1E2B24]">
                              {n.studentName} · Risiko {n.riskLevel}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(n.id);
                                setNoteScheduleId(n.scheduleId);
                                setNoteSummary(n.sessionSummary);
                                setNoteObservations(n.observations || '');
                                setNoteFollowUpInternal(n.followUpPlan || '');
                                setNoteNextDate(n.nextActionDate || '');
                                setNoteRisk(n.riskLevel);
                              }}
                              className="text-xs font-semibold text-[#315E4B] hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                          <p className="text-[#35443C]">{n.sessionSummary}</p>
                          {n.observations && <p className="text-xs text-[#596B61]">Observasi: {n.observations}</p>}
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* Student-facing Follow Up Plan */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                  <div>
                    <h2 className="text-xl font-bold text-[#1E2B24]">Kirim Rencana Tindak Lanjut ke Mahasiswa</h2>
                    <p className="text-xs text-[#596B61] mt-1">
                      Rencana aksi praktis ini akan muncul di dashboard mahasiswa sebagai panduan setelah sesi selesai.
                    </p>
                  </div>
                  <form onSubmit={handleSaveFollowUp} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Sesi Mahasiswa</label>
                        <select
                          value={fuScheduleId}
                          onChange={(e) => setFuScheduleId(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          {schedules.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.studentName} · {s.date}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Target Tanggal</label>
                        <input
                          type="date"
                          value={fuTargetDate}
                          onChange={(e) => setFuTargetDate(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Judul Rencana</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: Latihan Regulasi Napas & Jurnal Syukur 7 Hari"
                        value={fuTitle}
                        onChange={(e) => setFuTitle(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Langkah Praktis untuk Mahasiswa</label>
                      <textarea
                        rows={3}
                        required
                        value={fuItems}
                        onChange={(e) => setFuItems(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={schedules.length === 0}
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738] disabled:opacity-50"
                    >
                      Kirim Rencana Tindak Lanjut
                    </button>
                  </form>

                  {followUps.length > 0 && (
                    <div className="pt-4 border-t border-[#EAE3D2] space-y-2">
                      {followUps.map((f) => (
                        <div key={f.id} className="rounded-lg border border-[#EAE3D2] bg-[#FAF8F3] p-3 text-xs flex justify-between">
                          <span className="font-semibold text-[#1E2B24]">{f.planTitle}</span>
                          <span className="text-[#315E4B] capitalize">{f.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {activeTab === 'history' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                <h1 className="text-xl font-bold text-[#1E2B24]">Riwayat Pelayanan Konseling</h1>
                {pastSchedules.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada sesi konseling yang selesai atau dibatalkan.</p>
                ) : (
                  <div className="divide-y divide-[#EAE3D2]">
                    {pastSchedules.map((s) => (
                      <div key={s.id} className="py-3.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div>
                          <p className="font-semibold text-[#1E2B24]">
                            {s.studentName} · {CATEGORY_LABELS[s.category]}
                          </p>
                          <p className="text-xs text-[#596B61] tabular-nums">
                            {formatDateId(s.date)} · {s.startTime}–{s.endTime} WIB · {s.method}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-[#315E4B]">{SCHEDULE_STATUS_LABELS[s.status]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {activeTab === 'notifications' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                <h1 className="text-xl font-bold text-[#1E2B24]">Notifikasi Konselor</h1>
                {notifications.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada notifikasi.</p>
                ) : (
                  <div className="space-y-3">
                    {notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
                          n.isRead ? 'border-[#EAE3D2] bg-white' : 'border-[#A3B8A5] bg-[#EBF0EC]/60'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-[#1E2B24]">{n.title}</p>
                          <p className="text-sm text-[#45564D] mt-0.5">{n.message}</p>
                          <p className="text-xs text-[#596B61] mt-1">{formatTimestampId(n.createdAt)}</p>
                        </div>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => markNotificationRead(n.id)}
                            className="text-xs font-semibold text-[#315E4B] hover:underline"
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

            {activeTab === 'profile' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                <h1 className="text-xl font-bold text-[#1E2B24]">Profil & Ketersediaan Jadwal Konselor</h1>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Nama Lengkap & Gelar</label>
                      <input
                        type="text"
                        required
                        value={profName}
                        onChange={(e) => setProfName(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Jabatan / Spesialisasi Utama</label>
                      <input
                        type="text"
                        required
                        value={profTitle}
                        onChange={(e) => setProfTitle(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Bidang Layanan BK</label>
                    <div className="flex flex-wrap gap-2">
                      {['Pribadi', 'Sosial', 'Belajar', 'Karier'].map((spec) => {
                        const checked = profSpecs.includes(spec);
                        return (
                          <button
                            key={spec}
                            type="button"
                            onClick={() =>
                              setProfSpecs((prev) =>
                                checked ? prev.filter((s) => s !== spec) : [...prev, spec]
                              )
                            }
                            className={`rounded-lg border px-3.5 py-1.5 text-xs font-medium ${
                              checked
                                ? 'border-[#315E4B] bg-[#315E4B] text-white'
                                : 'border-[#D4E0D5] bg-[#FAF8F3] text-[#35443C]'
                            }`}
                          >
                            {spec}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Biografi Singkat</label>
                    <textarea
                      rows={3}
                      value={profBio}
                      onChange={(e) => setProfBio(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                      Slot Ketersediaan Mingguan (Satu baris per slot)
                    </label>
                    <textarea
                      rows={4}
                      value={profAvailabilityText}
                      onChange={(e) => setProfAvailabilityText(e.target.value)}
                      placeholder="Senin 09:00-12:00"
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm font-mono"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                  >
                    Simpan Profil Konselor
                  </button>
                </form>
              </section>
            )}
          </main>
        </div>
      </div>

      {/* Private Story Modal */}
      {storyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-[#315E4B]">Keluhan Pribadi Mahasiswa (Privat)</p>
                <h3 className="text-lg font-bold text-[#1E2B24]">{storyModal.request.studentName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setStoryModal(null)}
                className="rounded-lg border border-[#EAE3D2] px-3 py-1 text-xs"
              >
                Tutup
              </button>
            </div>
            <div className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 text-sm text-[#35443C] whitespace-pre-line leading-relaxed">
              {storyModal.story}
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
            <h3 className="text-lg font-bold text-[#1E2B24]">Usulkan Perubahan Jadwal</h3>
            <p className="text-xs text-[#596B61]">
              Sesi bersama {rescheduleTarget.studentName} pada {rescheduleTarget.date} {rescheduleTarget.startTime} WIB
            </p>
            <textarea
              rows={3}
              required
              placeholder="Tuliskan usulan waktu pengganti..."
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
                onClick={handleProposeReschedule}
                className="rounded-lg bg-[#315E4B] px-4 py-2 text-sm font-semibold text-white"
              >
                Kirim Usulan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
