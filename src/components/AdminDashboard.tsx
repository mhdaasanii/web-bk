import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard,
  Users,
  UserCheck,
  FileCheck2,
  CalendarDays,
  Video,
  History,
  Newspaper,
  Globe,
  Bell,
  BarChart3,
  Settings,
  Download,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  query,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { db, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  addMinutesToTime,
  formatDateId,
  formatTimestampId,
  hasTimeOverlap,
  todayDateWIB,
} from '../lib/timeWindow.ts';
import {
  AdminActivityLog,
  Article,
  CATEGORY_LABELS,
  CounselingCategory,
  CounselingMethod,
  CounselingRequest,
  CounselingSchedule,
  CounselorInvite,
  CounselorProfile,
  RequestStatus,
  REQUEST_STATUS_LABELS,
  SCHEDULE_STATUS_LABELS,
  StudentProfile,
  UserAccount,
  VideoRoom,
  VideoSessionLog,
} from '../types/index.ts';

type AdminTab =
  | 'overview'
  | 'students'
  | 'counselors'
  | 'requests'
  | 'schedules'
  | 'videorooms'
  | 'history'
  | 'articles'
  | 'content'
  | 'notifications'
  | 'reports'
  | 'settings';

export const AdminDashboard: React.FC = () => {
  const {
    firebaseUser,
    userAccount,
    notifications,
    unreadCount,
    siteAbout,
    pushToast,
    markNotificationRead,
    sendNotification,
    logAdminAction,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  // Core collections
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [studentProfiles, setStudentProfiles] = useState<StudentProfile[]>([]);
  const [counselors, setCounselors] = useState<CounselorProfile[]>([]);
  const [invites, setInvites] = useState<CounselorInvite[]>([]);
  const [requests, setRequests] = useState<CounselingRequest[]>([]);
  const [schedules, setSchedules] = useState<CounselingSchedule[]>([]);
  const [videoRooms, setVideoRooms] = useState<VideoRoom[]>([]);
  const [videoLogs, setVideoLogs] = useState<VideoSessionLog[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminActivityLog[]>([]);

  // Search & filters
  const [studentSearch, setStudentSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');
  const [calendarMode, setCalendarMode] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [calendarDate, setCalendarDate] = useState(todayDateWIB());

  // Request Detail Modal (strictly administrative fields)
  const [detailRequest, setDetailRequest] = useState<CounselingRequest | null>(null);
  const [modalCounselorUid, setModalCounselorUid] = useState('');
  const [modalAdminNote, setModalAdminNote] = useState('');
  const [modalRejectReason, setModalRejectReason] = useState('');

  // Schedule Builder State
  const [schedRequestId, setSchedRequestId] = useState('');
  const [schedCounselorUid, setSchedCounselorUid] = useState('');
  const [schedDate, setSchedDate] = useState(todayDateWIB());
  const [schedStart, setSchedStart] = useState('09:00');
  const [schedDuration, setSchedDuration] = useState(60);
  const [schedMethod, setSchedMethod] = useState<CounselingMethod>('online');
  const [schedLocation, setSchedLocation] = useState('Ruang Konseling 1, Lab BK UNUGHA');
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  // Add/Edit Counselor Form
  const [cEmail, setCEmail] = useState('');
  const [cName, setCName] = useState('');
  const [cTitle, setCTitle] = useState('Konselor Lab BK UNUGHA');
  const [cSpecs, setCSpecs] = useState<string[]>(['Pribadi', 'Belajar']);
  const [cBio, setCBio] = useState('');
  const [cAvail, setCAvail] = useState('Senin 09:00-12:00\nRabu 13:00-16:00');

  // Article Editor State
  const [artTitle, setArtTitle] = useState('');
  const [artCategory, setArtCategory] = useState('Kesehatan Mental');
  const [artExcerpt, setArtExcerpt] = useState('');
  const [artContent, setArtContent] = useState('');
  const [artAuthor, setArtAuthor] = useState('Tim Lab BK UNUGHA');
  const [artMinutes, setArtMinutes] = useState(4);
  const [artPublished, setArtPublished] = useState(true);
  const [editingArtId, setEditingArtId] = useState<string | null>(null);

  // Website Content & Settings Form
  const [cmsLabName, setCmsLabName] = useState(siteAbout.labName);
  const [cmsDesc, setCmsDesc] = useState(siteAbout.aboutDescription);
  const [cmsVision, setCmsVision] = useState(siteAbout.vision);
  const [cmsMission, setCmsMission] = useState(siteAbout.mission);
  const [cmsGoals, setCmsGoals] = useState(siteAbout.goals);
  const [cmsAddress, setCmsAddress] = useState(siteAbout.address);
  const [cmsEmail, setCmsEmail] = useState(siteAbout.contactEmail);
  const [cmsPhone, setCmsPhone] = useState(siteAbout.contactPhone);
  const [cmsHours, setCmsHours] = useState(siteAbout.serviceHours);
  const [setRetentionDays, setSetRetentionDays] = useState(siteAbout.retentionDays || 365);
  const [setVideoWindow, setSetVideoWindow] = useState(siteAbout.videoWindowMinutesBefore || 15);

  // Notification broadcast state
  const [notifTargetUid, setNotifTargetUid] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifBody, setNotifBody] = useState('');

  useEffect(() => {
    setCmsLabName(siteAbout.labName);
    setCmsDesc(siteAbout.aboutDescription);
    setCmsVision(siteAbout.vision);
    setCmsMission(siteAbout.mission);
    setCmsGoals(siteAbout.goals);
    setCmsAddress(siteAbout.address);
    setCmsEmail(siteAbout.contactEmail);
    setCmsPhone(siteAbout.contactPhone);
    setCmsHours(siteAbout.serviceHours);
    setSetRetentionDays(siteAbout.retentionDays || 365);
    setSetVideoWindow(siteAbout.videoWindowMinutesBefore || 15);
  }, [siteAbout]);

  useEffect(() => {
    if (!firebaseUser || userAccount?.role !== 'admin') return;
    const unsubs: Array<() => void> = [];

    unsubs.push(
      onSnapshot(collection(db, 'users'), (snap) => {
        setUsers(snap.docs.map((d) => d.data() as UserAccount));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'studentProfiles'), (snap) => {
        setStudentProfiles(snap.docs.map((d) => d.data() as StudentProfile));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'counselorProfiles'), (snap) => {
        const list = snap.docs.map((d) => d.data() as CounselorProfile);
        setCounselors(list);
        if (list.length > 0 && !schedCounselorUid) setSchedCounselorUid(list[0].uid);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'counselorInvites'), (snap) => {
        setInvites(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CounselorInvite, 'id'>) })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'counselingRequests'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingRequest, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setRequests(list);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'counselingSchedules'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CounselingSchedule, 'id'>) }))
          .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
        setSchedules(list);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'videoRooms'), (snap) => {
        setVideoRooms(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<VideoRoom, 'id'>) })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'videoSessionLogs'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<VideoSessionLog, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setVideoLogs(list);
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'articles'), (snap) => {
        setArticles(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Article, 'id'>) })));
      })
    );
    unsubs.push(
      onSnapshot(collection(db, 'adminActivityLogs'), (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AdminActivityLog, 'id'>) }))
          .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setAuditLogs(list);
      })
    );

    return () => unsubs.forEach((u) => u());
  }, [firebaseUser, userAccount]);

  // Real-time KPI Metrics
  const kpis = useMemo(() => {
    const totalStudents = users.filter((u) => u.role === 'student').length;
    const activeCounselors = counselors.filter((c) => c.isActive).length;
    const newRequests = requests.filter((r) => r.status === 'new').length;
    const awaitingApproval = requests.filter((r) =>
      ['new', 'verifying', 'approved', 'awaiting_schedule'].includes(r.status)
    ).length;
    const scheduledCount = schedules.filter((s) => s.status === 'confirmed').length;
    const inProgressCount = schedules.filter((s) => s.status === 'in_progress').length;
    const completedCount = schedules.filter((s) => s.status === 'completed').length;
    const cancelledCount =
      schedules.filter((s) => s.status === 'cancelled').length +
      requests.filter((r) => r.status === 'cancelled' || r.status === 'rejected').length;

    return {
      totalStudents,
      activeCounselors,
      newRequests,
      awaitingApproval,
      scheduledCount,
      inProgressCount,
      completedCount,
      cancelledCount,
    };
  }, [users, counselors, requests, schedules]);

  // Analytics aggregations for charts & reports
  const analytics = useMemo(() => {
    const byCategory: Record<CounselingCategory, number> = {
      pribadi: 0,
      sosial: 0,
      belajar: 0,
      karier: 0,
    };
    requests.forEach((r) => {
      if (byCategory[r.category] !== undefined) byCategory[r.category]++;
    });

    const onlineCount = schedules.filter((s) => s.method === 'online').length;
    const offlineCount = schedules.filter((s) => s.method === 'offline').length;

    const monthlyMap = new Map<string, number>();
    requests.forEach((r) => {
      const dateStr = r.preferredDate || todayDateWIB();
      const ym = dateStr.slice(0, 7);
      monthlyMap.set(ym, (monthlyMap.get(ym) || 0) + 1);
    });
    const monthly = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);

    const activeUsersBreakdown = [
      { label: 'Mahasiswa', count: users.filter((u) => u.role === 'student' && u.isActive).length },
      { label: 'Konselor', count: users.filter((u) => u.role === 'counselor' && u.isActive).length },
      { label: 'Admin', count: users.filter((u) => u.role === 'admin' && u.isActive).length },
    ];

    const byCounselorMap = new Map<string, number>();
    schedules.forEach((s) => {
      byCounselorMap.set(s.counselorName, (byCounselorMap.get(s.counselorName) || 0) + 1);
    });

    return {
      byCategory,
      onlineCount,
      offlineCount,
      monthly,
      activeUsersBreakdown,
      byCounselor: Array.from(byCounselorMap.entries()),
    };
  }, [requests, schedules, users]);

  // Actions
  const handleToggleUserActive = async (target: UserAccount) => {
    try {
      await updateDoc(doc(db, 'users', target.uid), {
        isActive: !target.isActive,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(
        target.isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun',
        'user',
        target.uid,
        `${target.email} (${target.role})`
      );
      pushToast('Status Akun Diperbarui', `Akun ${target.displayName} diperbarui.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    }
  };

  const handleCreateOrInviteCounselor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !cEmail.trim() || !cName.trim()) return;
    const email = cEmail.trim().toLowerCase();
    const availList = cAvail
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 28);

    try {
      await setDoc(doc(db, 'counselorInvites', email), {
        email,
        fullName: cName.trim().slice(0, 120),
        title: cTitle.trim().slice(0, 120),
        specializations: cSpecs.length > 0 ? cSpecs : ['Pribadi'],
        bio: cBio.trim().slice(0, 1000),
        availability: availList.length > 0 ? availList : ['Senin 09:00-12:00'],
        isActive: true,
        createdBy: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // If this user has already signed in before, promote immediately & create counselorProfile
      const existingUser = users.find((u) => u.email.toLowerCase() === email);
      if (existingUser) {
        await updateDoc(doc(db, 'users', existingUser.uid), {
          role: 'counselor',
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'counselorProfiles', existingUser.uid), {
          uid: existingUser.uid,
          fullName: cName.trim().slice(0, 120),
          title: cTitle.trim().slice(0, 120),
          specializations: cSpecs.length > 0 ? cSpecs : ['Pribadi'],
          bio: cBio.trim().slice(0, 1000),
          photoUrl: existingUser.photoUrl || '',
          isActive: true,
          availability: availList.length > 0 ? availList : ['Senin 09:00-12:00'],
          maxWeeklySessions: 12,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await logAdminAction('Tambah Konselor', 'counselorInvite', email, `Konselor ${cName.trim()}`);
      setCEmail('');
      setCName('');
      setCBio('');
      pushToast(
        'Konselor Ditambahkan',
        existingUser
          ? `${cName.trim()} langsung diaktifkan sebagai Konselor.`
          : `Undangan konselor untuk ${email} disimpan. Akun akan otomatis aktif saat login Google.`,
        'success'
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `counselorInvites/${email}`);
    }
  };

  const handleToggleCounselorActive = async (c: CounselorProfile) => {
    try {
      await updateDoc(doc(db, 'counselorProfiles', c.uid), {
        isActive: !c.isActive,
        updatedAt: serverTimestamp(),
      });
      await logAdminAction(
        c.isActive ? 'Nonaktifkan Konselor' : 'Aktifkan Konselor',
        'counselorProfile',
        c.uid,
        c.fullName
      );
      pushToast('Status Konselor Diperbarui', `${c.fullName} kini ${c.isActive ? 'Nonaktif' : 'Aktif'}.`, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselorProfiles/${c.uid}`);
    }
  };

  const handleUpdateRequestStatus = async (
    req: CounselingRequest,
    status: RequestStatus,
    counselorUid?: string,
    reason?: string
  ) => {
    const chosenCounselor = counselors.find((c) => c.uid === counselorUid);
    try {
      const updates: Record<string, any> = {
        status,
        adminNote: modalAdminNote.trim().slice(0, 500),
        updatedAt: serverTimestamp(),
      };
      if (chosenCounselor) {
        updates.assignedCounselorUid = chosenCounselor.uid;
        updates.assignedCounselorName = chosenCounselor.fullName;
      }
      if (status === 'rejected' && reason) {
        updates.rejectionReason = reason.trim().slice(0, 500);
      }
      await updateDoc(doc(db, 'counselingRequests', req.id), updates);

      await sendNotification({
        targetUid: req.uid,
        targetRole: 'student',
        title: `Status Pengajuan: ${REQUEST_STATUS_LABELS[status]}`,
        message:
          status === 'rejected'
            ? `Pengajuan Anda ditolak. Alasan: ${reason || 'Belum memenuhi ketentuan.'}`
            : `Pengajuan ${CATEGORY_LABELS[req.category]} Anda berstatus: ${REQUEST_STATUS_LABELS[status]}.`,
        type: 'request',
      });

      await logAdminAction('Ubah Status Pengajuan', 'counselingRequest', req.id, `Status -> ${status}`);
      setDetailRequest(null);
      setModalRejectReason('');
      pushToast('Pengajuan Diperbarui', `Status pengajuan diubah menjadi ${REQUEST_STATUS_LABELS[status]}.`, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingRequests/${req.id}`);
    }
  };

  const handleCreateOrUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetReq = requests.find((r) => r.id === schedRequestId);
    const targetCounselor = counselors.find((c) => c.uid === schedCounselorUid);
    if (!targetReq || !targetCounselor) {
      pushToast('Data Belum Lengkap', 'Pilih pengajuan mahasiswa dan konselor aktif terlebih dahulu.', 'error');
      return;
    }

    const endTime = addMinutesToTime(schedStart, schedDuration);

    // Automatic Conflict Detection
    const conflict = schedules.find(
      (s) =>
        s.id !== reschedulingId &&
        s.date === schedDate &&
        (s.status === 'confirmed' || s.status === 'in_progress') &&
        (s.counselorUid === targetCounselor.uid || s.studentUid === targetReq.uid) &&
        hasTimeOverlap(schedStart, endTime, s.startTime, s.endTime)
    );

    if (conflict) {
      pushToast(
        'Bentrok Jadwal Terdeteksi',
        `Terdapat jadwal lain pada ${conflict.date} pukul ${conflict.startTime}–${conflict.endTime} WIB (${conflict.counselorName} / ${conflict.studentName}). Silakan pilih jam berbeda.`,
        'error'
      );
      return;
    }

    try {
      if (reschedulingId) {
        await updateDoc(doc(db, 'counselingSchedules', reschedulingId), {
          counselorUid: targetCounselor.uid,
          counselorName: targetCounselor.fullName,
          method: schedMethod,
          date: schedDate,
          startTime: schedStart,
          endTime,
          durationMinutes: Number(schedDuration),
          locationOrRoom: schedMethod === 'offline' ? schedLocation.trim() : 'Ruang Konseling Virtual',
          status: 'confirmed',
          rescheduleNote: '',
          updatedAt: serverTimestamp(),
        });

        await sendNotification({
          targetUid: targetReq.uid,
          targetRole: 'student',
          title: 'Jadwal Konseling Diperbarui',
          message: `Jadwal baru Anda: ${schedDate} pukul ${schedStart}–${endTime} WIB bersama ${targetCounselor.fullName}.`,
          type: 'schedule',
        });
        await sendNotification({
          targetUid: targetCounselor.uid,
          targetRole: 'counselor',
          title: 'Perubahan Jadwal Konseling',
          message: `Jadwal sesi bersama ${targetReq.studentName} diperbarui ke ${schedDate} pukul ${schedStart} WIB.`,
          type: 'schedule',
        });

        await logAdminAction('Jadwal Ulang Sesi', 'counselingSchedule', reschedulingId, `${schedDate} ${schedStart}`);
        setReschedulingId(null);
        pushToast('Jadwal Diperbarui', 'Jadwal berhasil dijadwalkan ulang dan notifikasi telah dikirim.', 'success');
      } else {
        const schRef = await addDoc(collection(db, 'counselingSchedules'), {
          requestId: targetReq.id,
          studentUid: targetReq.uid,
          studentName: targetReq.studentName,
          nim: targetReq.nim,
          studyProgram: targetReq.studyProgram,
          counselorUid: targetCounselor.uid,
          counselorName: targetCounselor.fullName,
          category: targetReq.category,
          method: schedMethod,
          date: schedDate,
          startTime: schedStart,
          endTime,
          durationMinutes: Number(schedDuration),
          locationOrRoom: schedMethod === 'offline' ? schedLocation.trim() : 'Ruang Konseling Virtual',
          status: 'confirmed',
          videoRoomId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        let videoRoomId = '';
        if (schedMethod === 'online') {
          const roomCode = `RT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          const validFrom = `${schedDate}T${schedStart}:00+07:00`;
          const validUntil = `${schedDate}T${endTime}:00+07:00`;
          const roomDoc = await addDoc(collection(db, 'videoRooms'), {
            scheduleId: schRef.id,
            studentUid: targetReq.uid,
            counselorUid: targetCounselor.uid,
            roomCode,
            status: 'ready',
            validFrom,
            validUntil,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          videoRoomId = roomDoc.id;
          await updateDoc(doc(db, 'counselingSchedules', schRef.id), {
            videoRoomId,
            updatedAt: serverTimestamp(),
          });
        }

        await updateDoc(doc(db, 'counselingRequests', targetReq.id), {
          status: 'scheduled',
          assignedCounselorUid: targetCounselor.uid,
          assignedCounselorName: targetCounselor.fullName,
          updatedAt: serverTimestamp(),
        });

        await sendNotification({
          targetUid: targetReq.uid,
          targetRole: 'student',
          title: schedMethod === 'online' ? 'Jadwal & Ruang Video Call Tersedia' : 'Jadwal Konseling Ditetapkan',
          message: `Sesi ${CATEGORY_LABELS[targetReq.category]} dijadwalkan pada ${schedDate} pukul ${schedStart}–${endTime} WIB bersama ${targetCounselor.fullName}.`,
          type: schedMethod === 'online' ? 'video' : 'schedule',
        });

        await sendNotification({
          targetUid: targetCounselor.uid,
          targetRole: 'counselor',
          title: 'Jadwal Konseling Baru Ditugaskan',
          message: `Anda dijadwalkan mendampingi ${targetReq.studentName} pada ${schedDate} pukul ${schedStart}–${endTime} WIB (${schedMethod}).`,
          type: 'schedule',
        });

        await logAdminAction(
          'Tetapkan Jadwal Konseling',
          'counselingSchedule',
          schRef.id,
          `${targetReq.studentName} dengan ${targetCounselor.fullName} (${schedDate} ${schedStart})`
        );

        pushToast(
          'Jadwal Ditetapkan',
          schedMethod === 'online'
            ? 'Jadwal & ruang video call otomatis dibuat. Notifikasi terkirim ke mahasiswa dan konselor.'
            : 'Jadwal tatap muka ditetapkan dan notifikasi telah terkirim.',
          'success'
        );
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'counselingSchedules');
    }
  };

  const handleCancelSchedule = async (sch: CounselingSchedule) => {
    try {
      await updateDoc(doc(db, 'counselingSchedules', sch.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'counselingRequests', sch.requestId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      await sendNotification({
        targetUid: sch.studentUid,
        targetRole: 'student',
        title: 'Jadwal Konseling Dibatalkan',
        message: `Jadwal konseling pada ${sch.date} pukul ${sch.startTime} WIB telah dibatalkan oleh Admin Lab BK.`,
        type: 'schedule',
      });
      await sendNotification({
        targetUid: sch.counselorUid,
        targetRole: 'counselor',
        title: 'Jadwal Konseling Dibatalkan',
        message: `Jadwal sesi bersama ${sch.studentName} pada ${sch.date} pukul ${sch.startTime} WIB dibatalkan.`,
        type: 'schedule',
      });
      await logAdminAction('Batalkan Jadwal', 'counselingSchedule', sch.id, `${sch.studentName} (${sch.date})`);
      pushToast('Jadwal Dibatalkan', 'Jadwal berhasil dibatalkan.', 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `counselingSchedules/${sch.id}`);
    }
  };

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!artTitle.trim() || !artContent.trim()) return;
    try {
      const payload = {
        title: artTitle.trim().slice(0, 200),
        category: artCategory.trim().slice(0, 80),
        excerpt: artExcerpt.trim().slice(0, 400) || artContent.trim().slice(0, 180),
        content: artContent.trim().slice(0, 15000),
        coverImage: '/src/assets/images/article_mental_health_1794662997735.jpg',
        authorName: artAuthor.trim().slice(0, 120),
        readMinutes: Number(artMinutes),
        published: artPublished,
        updatedAt: serverTimestamp(),
      };
      if (editingArtId) {
        await updateDoc(doc(db, 'articles', editingArtId), payload);
        setEditingArtId(null);
        pushToast('Artikel Diperbarui', 'Perubahan artikel berhasil disimpan.', 'success');
      } else {
        await addDoc(collection(db, 'articles'), { ...payload, createdAt: serverTimestamp() });
        pushToast('Artikel Diterbitkan', 'Artikel edukasi baru berhasil ditambahkan.', 'success');
      }
      setArtTitle('');
      setArtExcerpt('');
      setArtContent('');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'articles');
    }
  };

  const handleSaveCmsAndSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'siteContent', 'about'), {
        key: 'about',
        labName: cmsLabName.trim(),
        aboutDescription: cmsDesc.trim(),
        vision: cmsVision.trim(),
        mission: cmsMission.trim(),
        goals: cmsGoals.trim(),
        address: cmsAddress.trim(),
        contactEmail: cmsEmail.trim(),
        contactPhone: cmsPhone.trim(),
        serviceHours: cmsHours.trim(),
        retentionDays: Number(setRetentionDays),
        videoWindowMinutesBefore: Number(setVideoWindow),
        updatedAt: serverTimestamp(),
      });
      await logAdminAction('Perbarui Konten Website', 'siteContent', 'about', 'Pembaruan profil Lab BK & pengaturan');
      pushToast('Konten Disimpan', 'Informasi Lab BK dan pengaturan platform berhasil diperbarui.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'siteContent/about');
    }
  };

  const handleSendManualNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTargetUid || !notifTitle.trim() || !notifBody.trim()) return;
    const target = users.find((u) => u.uid === notifTargetUid);
    if (!target) return;
    await sendNotification({
      targetUid: target.uid,
      targetRole: target.role,
      title: notifTitle.trim(),
      message: notifBody.trim(),
      type: 'system',
    });
    setNotifTitle('');
    setNotifBody('');
    pushToast('Notifikasi Terkirim', `Pesan dikirim ke ${target.displayName}.`, 'success');
  };

  // Real Excel Export (.xlsx)
  const handleExportExcel = () => {
    const summaryRows = [
      { Metrik: 'Total Mahasiswa Terdaftar', Jumlah: kpis.totalStudents },
      { Metrik: 'Total Konselor Aktif', Jumlah: kpis.activeCounselors },
      { Metrik: 'Pengajuan Konseling Baru', Jumlah: kpis.newRequests },
      { Metrik: 'Menunggu Persetujuan / Jadwal', Jumlah: kpis.awaitingApproval },
      { Metrik: 'Jadwal Dikonfirmasi', Jumlah: kpis.scheduledCount },
      { Metrik: 'Sedang Berlangsung', Jumlah: kpis.inProgressCount },
      { Metrik: 'Sesi Selesai', Jumlah: kpis.completedCount },
      { Metrik: 'Dibatalkan / Ditolak', Jumlah: kpis.cancelledCount },
    ];

    const scheduleRows = schedules.map((s) => ({
      Tanggal: s.date,
      Jam: `${s.startTime}-${s.endTime}`,
      Mahasiswa: s.studentName,
      NIM: s.nim || '-',
      ProgramStudi: s.studyProgram || '-',
      Bidang: CATEGORY_LABELS[s.category],
      Metode: s.method,
      Konselor: s.counselorName,
      Status: SCHEDULE_STATUS_LABELS[s.status],
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Ringkasan Statistik');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(scheduleRows), 'Rekap Layanan');
    XLSX.writeFile(wb, `Laporan-Ruang-Tumbuh-UNUGHA-${todayDateWIB()}.xlsx`);
    logAdminAction('Ekspor Laporan Excel', 'report', todayDateWIB(), 'Unduh file XLSX statistik');
    pushToast('Ekspor Excel Berhasil', 'File .xlsx laporan statistik berhasil diunduh.', 'success');
  };

  // Real PDF Export (.pdf)
  const handleExportPdf = () => {
    const docPdf = new jsPDF();
    docPdf.setFontSize(16);
    docPdf.text('Laporan Statistik Pelayanan Konseling - Ruang Tumbuh', 14, 18);
    docPdf.setFontSize(10);
    docPdf.text('Laboratorium Bimbingan dan Konseling UNUGHA Cilacap', 14, 25);
    docPdf.text(`Tanggal Cetak: ${todayDateWIB()} (Data Administratif - Tanpa Catatan Privat)`, 14, 31);

    let y = 44;
    docPdf.setFontSize(12);
    docPdf.text('1. Ringkasan Statistik', 14, y);
    y += 8;
    docPdf.setFontSize(10);
    const lines = [
      `Total Mahasiswa Terdaftar: ${kpis.totalStudents}`,
      `Total Konselor Aktif: ${kpis.activeCounselors}`,
      `Total Pengajuan Masuk: ${requests.length}`,
      `Sesi Konseling Online: ${analytics.onlineCount} | Offline: ${analytics.offlineCount}`,
      `Sesi Selesai: ${kpis.completedCount} | Dijadwalkan: ${kpis.scheduledCount}`,
    ];
    lines.forEach((line) => {
      docPdf.text(line, 16, y);
      y += 6;
    });

    y += 6;
    docPdf.setFontSize(12);
    docPdf.text('2. Rekap Bidang Layanan BK', 14, y);
    y += 8;
    docPdf.setFontSize(10);
    (['pribadi', 'sosial', 'belajar', 'karier'] as CounselingCategory[]).forEach((cat) => {
      docPdf.text(`${CATEGORY_LABELS[cat]}: ${analytics.byCategory[cat]} pengajuan`, 16, y);
      y += 6;
    });

    y += 6;
    docPdf.setFontSize(12);
    docPdf.text('3. Rekap Pelayanan Konselor', 14, y);
    y += 8;
    docPdf.setFontSize(10);
    if (analytics.byCounselor.length === 0) {
      docPdf.text('Belum ada sesi terjadwal.', 16, y);
    } else {
      analytics.byCounselor.forEach(([name, count]) => {
        if (y > 275) {
          docPdf.addPage();
          y = 20;
        }
        docPdf.text(`${name}: ${count} sesi`, 16, y);
        y += 6;
      });
    }

    docPdf.save(`Laporan-Ruang-Tumbuh-UNUGHA-${todayDateWIB()}.pdf`);
    logAdminAction('Ekspor Laporan PDF', 'report', todayDateWIB(), 'Unduh file PDF statistik');
    pushToast('Ekspor PDF Berhasil', 'File .pdf laporan statistik berhasil diunduh.', 'success');
  };

  const handleExportAdminJsonBackup = () => {
    const backup = {
      exportedAt: new Date().toISOString(),
      note: 'Cadangan data administratif (tidak menyertakan cerita pribadi atau catatan konseling privat).',
      users,
      studentProfiles,
      counselors,
      requests,
      schedules,
      articles,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-admin-ruang-tumbuh-${todayDateWIB()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRequests =
    requestStatusFilter === 'all'
      ? requests
      : requests.filter((r) => r.status === requestStatusFilter);

  const filteredStudents = users
    .filter((u) => u.role === 'student')
    .filter((u) => {
      const sp = studentProfiles.find((p) => p.uid === u.uid);
      const q = studentSearch.toLowerCase();
      return (
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (sp?.nim || '').toLowerCase().includes(q) ||
        (sp?.studyProgram || '').toLowerCase().includes(q)
      );
    });

  // Calendar Filter
  const visibleCalendarSchedules = useMemo(() => {
    if (calendarMode === 'daily') {
      return schedules.filter((s) => s.date === calendarDate);
    }
    if (calendarMode === 'monthly') {
      return schedules.filter((s) => s.date.slice(0, 7) === calendarDate.slice(0, 7));
    }
    // Weekly: 7-day window starting from selected date's Monday or selected date -3/+4
    const base = new Date(`${calendarDate}T00:00:00+07:00`).getTime();
    return schedules.filter((s) => {
      const t = new Date(`${s.date}T00:00:00+07:00`).getTime();
      return Math.abs(t - base) <= 3.5 * 24 * 3600 * 1000;
    });
  }, [schedules, calendarMode, calendarDate]);

  // Exact 12 Sidebar Items as Required
  const sidebarMenu: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: 'overview', label: 'Dashboard Utama', icon: LayoutDashboard },
    { id: 'students', label: 'Data Mahasiswa', icon: Users },
    { id: 'counselors', label: 'Data Konselor', icon: UserCheck },
    { id: 'requests', label: 'Pendaftaran Konseling', icon: FileCheck2, badge: kpis.newRequests },
    { id: 'schedules', label: 'Jadwal Konseling', icon: CalendarDays },
    { id: 'videorooms', label: 'Ruang Konseling Online', icon: Video },
    { id: 'history', label: 'Riwayat Pelayanan', icon: History },
    { id: 'articles', label: 'Artikel dan Edukasi', icon: Newspaper },
    { id: 'content', label: 'Manajemen Konten Website', icon: Globe },
    { id: 'notifications', label: 'Notifikasi', icon: Bell, badge: unreadCount },
    { id: 'reports', label: 'Laporan dan Statistik', icon: BarChart3 },
    { id: 'settings', label: 'Pengaturan Website', icon: Settings },
  ];

  const maxCategory = Math.max(1, ...Object.values(analytics.byCategory));
  const maxMonthly = Math.max(1, ...analytics.monthly.map(([, v]) => v));

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#F7F4EC]">
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
          {/* Admin Sidebar */}
          <aside className="lg:col-span-3 space-y-4">
            <div className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
              <p className="text-xs font-semibold text-[#315E4B]">Administrasi Lab BK UNUGHA</p>
              <h2 className="mt-1 text-lg font-bold text-[#1E2B24] truncate">{userAccount?.displayName}</h2>
              <p className="text-xs text-[#596B61] truncate">{userAccount?.email}</p>
            </div>

            <nav className="rounded-2xl border border-[#EAE3D2] bg-white p-2 space-y-1">
              {sidebarMenu.map((item) => {
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

          {/* Main Admin Viewport */}
          <main className="lg:col-span-9 space-y-6">
            {/* 1. Dashboard Utama */}
            {activeTab === 'overview' && (
              <>
                <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">Dashboard Utama Admin</h1>
                    <p className="text-sm text-[#45564D] mt-0.5">
                      Pemantauan statistik pelayanan konseling Laboratorium BK UNUGHA secara real-time.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('schedules')}
                    className="rounded-xl bg-[#315E4B] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                  >
                    Kelola Jadwal Konseling
                  </button>
                </div>

                {/* 8 KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Mahasiswa Terdaftar', val: kpis.totalStudents },
                    { label: 'Konselor Aktif', val: kpis.activeCounselors },
                    { label: 'Pengajuan Baru', val: kpis.newRequests },
                    { label: 'Menunggu Persetujuan', val: kpis.awaitingApproval },
                    { label: 'Sudah Dijadwalkan', val: kpis.scheduledCount },
                    { label: 'Sedang Berlangsung', val: kpis.inProgressCount },
                    { label: 'Konseling Selesai', val: kpis.completedCount },
                    { label: 'Dibatalkan / Ditolak', val: kpis.cancelledCount },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[#EAE3D2] bg-white p-5">
                      <p className="text-xs text-[#596B61]">{item.label}</p>
                      <p className="mt-2 text-2xl font-bold text-[#1E2B24] tabular-nums">{item.val}</p>
                    </div>
                  ))}
                </div>

                {/* 4 Analytics Charts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Chart 1: Pendaftaran per Bulan */}
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#1E2B24]">Pendaftaran Konseling Berdasarkan Bulan</h2>
                    {analytics.monthly.length === 0 ? (
                      <p className="text-xs text-[#596B61]">Belum ada data pendaftaran bulanan.</p>
                    ) : (
                      <div className="space-y-2.5">
                        {analytics.monthly.map(([month, count]) => (
                          <div key={month} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono text-[#35443C]">{month}</span>
                              <span className="font-semibold tabular-nums text-[#315E4B]">{count}</span>
                            </div>
                            <div className="h-2.5 rounded bg-[#EBF0EC] overflow-hidden">
                              <div
                                className="h-full bg-[#315E4B]"
                                style={{ width: `${Math.round((count / maxMonthly) * 100)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Chart 2: Konseling per Bidang BK */}
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#1E2B24]">Jumlah Konseling Berdasarkan Bidang BK</h2>
                    <div className="space-y-2.5">
                      {(['pribadi', 'sosial', 'belajar', 'karier'] as CounselingCategory[]).map((cat) => {
                        const count = analytics.byCategory[cat];
                        return (
                          <div key={cat} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-[#35443C]">{CATEGORY_LABELS[cat]}</span>
                              <span className="font-semibold tabular-nums text-[#315E4B]">{count}</span>
                            </div>
                            <div className="h-2.5 rounded bg-[#EBF0EC] overflow-hidden">
                              <div
                                className="h-full bg-[#A3B8A5]"
                                style={{ width: `${Math.round((count / maxCategory) * 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chart 3: Pengguna Aktif */}
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#1E2B24]">Pengguna Aktif Platform</h2>
                    <div className="grid grid-cols-3 gap-3">
                      {analytics.activeUsersBreakdown.map((u) => (
                        <div key={u.label} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 text-center">
                          <p className="text-2xl font-bold text-[#315E4B] tabular-nums">{u.count}</p>
                          <p className="mt-1 text-xs text-[#596B61]">{u.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chart 4: Online vs Offline */}
                  <div className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                    <h2 className="text-base font-bold text-[#1E2B24]">Metode Sesi Konseling (Online vs Offline)</h2>
                    <div className="flex items-center gap-6">
                      <svg viewBox="0 0 36 36" className="h-24 w-24 shrink-0">
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#EAE3D2" strokeWidth="4" />
                        <circle
                          cx="18"
                          cy="18"
                          r="15.915"
                          fill="none"
                          stroke="#315E4B"
                          strokeWidth="4"
                          strokeDasharray={`${
                            analytics.onlineCount + analytics.offlineCount === 0
                              ? 50
                              : Math.round(
                                  (analytics.onlineCount / (analytics.onlineCount + analytics.offlineCount)) * 100
                                )
                          } 100`}
                          strokeDashoffset="25"
                        />
                      </svg>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm bg-[#315E4B]" />
                          <span>Online (Video Call): <strong className="tabular-nums">{analytics.onlineCount}</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="h-3 w-3 rounded-sm bg-[#EAE3D2]" />
                          <span>Offline (Lab BK): <strong className="tabular-nums">{analytics.offlineCount}</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Latest Requests Table */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-[#1E2B24]">Pengajuan Konseling Terbaru</h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('requests')}
                      className="text-xs font-semibold text-[#315E4B] hover:underline"
                    >
                      Lihat Semua
                    </button>
                  </div>
                  {requests.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada pengajuan masuk.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                            <th className="py-2.5 pr-4 font-semibold">Nama Mahasiswa</th>
                            <th className="py-2.5 pr-4 font-semibold">NIM</th>
                            <th className="py-2.5 pr-4 font-semibold">Program Studi</th>
                            <th className="py-2.5 pr-4 font-semibold">Bidang</th>
                            <th className="py-2.5 pr-4 font-semibold">Tanggal</th>
                            <th className="py-2.5 pr-4 font-semibold">Metode</th>
                            <th className="py-2.5 pr-4 font-semibold">Status</th>
                            <th className="py-2.5 text-right font-semibold">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EAE3D2]">
                          {requests.slice(0, 8).map((r) => (
                            <tr key={r.id}>
                              <td className="py-3 pr-4 font-medium text-[#1E2B24]">{r.studentName}</td>
                              <td className="py-3 pr-4 font-mono text-xs tabular-nums text-[#45564D]">{r.nim}</td>
                              <td className="py-3 pr-4 text-[#45564D]">{r.studyProgram}</td>
                              <td className="py-3 pr-4 text-[#45564D]">{CATEGORY_LABELS[r.category]}</td>
                              <td className="py-3 pr-4 tabular-nums text-[#45564D]">{r.preferredDate}</td>
                              <td className="py-3 pr-4 capitalize text-[#45564D]">{r.method}</td>
                              <td className="py-3 pr-4 font-medium text-[#315E4B]">{REQUEST_STATUS_LABELS[r.status]}</td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDetailRequest(r);
                                    setModalCounselorUid(r.assignedCounselorUid || counselors[0]?.uid || '');
                                    setModalAdminNote(r.adminNote || '');
                                  }}
                                  className="rounded-lg border border-[#C6D4C8] px-3 py-1 text-xs font-semibold text-[#315E4B] hover:bg-[#EBF0EC]"
                                >
                                  Detail
                                </button>
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

            {/* 2. Data Mahasiswa */}
            {activeTab === 'students' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h1 className="text-xl font-bold text-[#1E2B24]">Data Mahasiswa Terdaftar</h1>
                  <input
                    type="search"
                    placeholder="Cari nama, NIM, atau prodi..."
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full sm:w-72 rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2 text-sm"
                  />
                </div>
                {filteredStudents.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Tidak ada data mahasiswa yang sesuai.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                          <th className="py-2.5 pr-4 font-semibold">Nama</th>
                          <th className="py-2.5 pr-4 font-semibold">NIM</th>
                          <th className="py-2.5 pr-4 font-semibold">Program Studi</th>
                          <th className="py-2.5 pr-4 font-semibold">Email</th>
                          <th className="py-2.5 pr-4 font-semibold">Status</th>
                          <th className="py-2.5 text-right font-semibold">Aksi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE3D2]">
                        {filteredStudents.map((stu) => {
                          const sp = studentProfiles.find((p) => p.uid === stu.uid);
                          return (
                            <tr key={stu.uid}>
                              <td className="py-3 pr-4 font-medium">{sp?.fullName || stu.displayName}</td>
                              <td className="py-3 pr-4 font-mono text-xs tabular-nums">{sp?.nim || '-'}</td>
                              <td className="py-3 pr-4 text-[#45564D]">
                                {sp ? `${sp.studyProgram} (Sem ${sp.semester})` : 'Belum melengkapi'}
                              </td>
                              <td className="py-3 pr-4 text-xs text-[#596B61]">{stu.email}</td>
                              <td className="py-3 pr-4 text-xs font-semibold text-[#315E4B]">
                                {stu.isActive ? 'Aktif' : 'Nonaktif'}
                              </td>
                              <td className="py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserActive(stu)}
                                  className="text-xs font-semibold text-[#315E4B] hover:underline"
                                >
                                  {stu.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 3. Data Konselor */}
            {activeTab === 'counselors' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                  <h1 className="text-xl font-bold text-[#1E2B24]">Tambah / Undang Konselor Lab BK</h1>
                  <form onSubmit={handleCreateOrInviteCounselor} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Email Google Konselor</label>
                        <input
                          type="email"
                          required
                          placeholder="konselor@unugha.ac.id"
                          value={cEmail}
                          onChange={(e) => setCEmail(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Nama Lengkap & Gelar</label>
                        <input
                          type="text"
                          required
                          placeholder="Contoh: Aulia Rahmawati, M.Pd., Kons."
                          value={cName}
                          onChange={(e) => setCName(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Jabatan / Peran</label>
                        <input
                          type="text"
                          required
                          value={cTitle}
                          onChange={(e) => setCTitle(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Bidang Layanan</label>
                        <div className="flex flex-wrap gap-1.5">
                          {['Pribadi', 'Sosial', 'Belajar', 'Karier'].map((sp) => {
                            const active = cSpecs.includes(sp);
                            return (
                              <button
                                key={sp}
                                type="button"
                                onClick={() =>
                                  setCSpecs((prev) => (active ? prev.filter((x) => x !== sp) : [...prev, sp]))
                                }
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                                  active
                                    ? 'border-[#315E4B] bg-[#315E4B] text-white'
                                    : 'border-[#D4E0D5] bg-[#FAF8F3] text-[#35443C]'
                                }`}
                              >
                                {sp}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Biografi Singkat</label>
                      <input
                        type="text"
                        value={cBio}
                        onChange={(e) => setCBio(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                        Ketersediaan Jadwal (Satu baris per slot)
                      </label>
                      <textarea
                        rows={2}
                        value={cAvail}
                        onChange={(e) => setCAvail(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Daftarkan Konselor</span>
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Daftar Konselor & Beban Jadwal</h2>
                  {counselors.length === 0 && invites.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada konselor terdaftar.</p>
                  ) : (
                    <div className="space-y-3">
                      {counselors.map((c) => {
                        const workload = schedules.filter(
                          (s) => s.counselorUid === c.uid && (s.status === 'confirmed' || s.status === 'in_progress')
                        ).length;
                        return (
                          <div
                            key={c.uid}
                            className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 flex flex-wrap items-center justify-between gap-4"
                          >
                            <div>
                              <h3 className="text-base font-bold text-[#1E2B24]">{c.fullName}</h3>
                              <p className="text-xs text-[#45564D]">
                                {c.title} · Bidang: {c.specializations.join(', ')}
                              </p>
                              <p className="text-xs text-[#596B61] mt-1 tabular-nums">
                                Jadwal Aktif: {workload} sesi · Slot: {c.availability.join(' | ')}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleCounselorActive(c)}
                              className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold ${
                                c.isActive
                                  ? 'border-[#C6D4C8] bg-white text-[#315E4B]'
                                  : 'border-amber-300 bg-amber-50 text-amber-800'
                              }`}
                            >
                              {c.isActive ? 'Aktif (Nonaktifkan)' : 'Nonaktif (Aktifkan)'}
                            </button>
                          </div>
                        );
                      })}

                      {invites.map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-xl border border-dashed border-[#C6D4C8] bg-white p-4 flex items-center justify-between text-xs"
                        >
                          <div>
                            <p className="font-semibold text-[#1E2B24]">
                              Undangan Terdaftar: {inv.fullName} ({inv.email})
                            </p>
                            <p className="text-[#596B61]">Menunggu konselor login pertama kali dengan akun Google tersebut.</p>
                          </div>
                          <span className="text-[#315E4B] font-medium">Terundang</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* 4. Pendaftaran Konseling */}
            {activeTab === 'requests' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-xl font-bold text-[#1E2B24]">Manajemen Pendaftaran Konseling</h1>
                    <p className="text-xs text-[#596B61] mt-1">
                      Admin mengelola verifikasi administratif dan penugasan konselor. Isi keluhan pribadi mahasiswa tidak ditampilkan di panel admin.
                    </p>
                  </div>
                  <select
                    value={requestStatusFilter}
                    onChange={(e) => setRequestStatusFilter(e.target.value)}
                    className="rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-2 text-xs font-medium"
                  >
                    <option value="all">Semua Status</option>
                    {Object.entries(REQUEST_STATUS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {filteredRequests.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Tidak ada data pengajuan untuk filter ini.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                          <th className="py-2.5 pr-4 font-semibold">Mahasiswa</th>
                          <th className="py-2.5 pr-4 font-semibold">Bidang & Metode</th>
                          <th className="py-2.5 pr-4 font-semibold">Preferensi</th>
                          <th className="py-2.5 pr-4 font-semibold">Konselor</th>
                          <th className="py-2.5 pr-4 font-semibold">Status</th>
                          <th className="py-2.5 text-right font-semibold">Kelola</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE3D2]">
                        {filteredRequests.map((r) => (
                          <tr key={r.id}>
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-[#1E2B24]">{r.studentName}</p>
                              <p className="text-xs text-[#596B61] font-mono tabular-nums">
                                {r.nim} · {r.studyProgram}
                              </p>
                            </td>
                            <td className="py-3 pr-4 text-xs">
                              <p className="font-medium text-[#1E2B24]">{CATEGORY_LABELS[r.category]}</p>
                              <p className="capitalize text-[#596B61]">{r.method}</p>
                            </td>
                            <td className="py-3 pr-4 text-xs tabular-nums text-[#45564D]">
                              {r.preferredDate} · {r.preferredTime} WIB
                            </td>
                            <td className="py-3 pr-4 text-xs text-[#45564D]">
                              {r.assignedCounselorName || 'Belum ditentukan'}
                            </td>
                            <td className="py-3 pr-4 text-xs font-semibold text-[#315E4B]">
                              {REQUEST_STATUS_LABELS[r.status]}
                            </td>
                            <td className="py-3 text-right space-x-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setDetailRequest(r);
                                  setModalCounselorUid(r.assignedCounselorUid || counselors[0]?.uid || '');
                                  setModalAdminNote(r.adminNote || '');
                                }}
                                className="rounded-lg border border-[#C6D4C8] px-3 py-1.5 text-xs font-semibold text-[#315E4B] hover:bg-[#EBF0EC]"
                              >
                                Verifikasi & Tugaskan
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 5. Jadwal Konseling */}
            {activeTab === 'schedules' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-xl font-bold text-[#1E2B24]">
                        {reschedulingId ? 'Penjadwalan Ulang Konseling' : 'Penetapan Jadwal Konseling'}
                      </h1>
                      <p className="text-xs text-[#596B61] mt-1">
                        Sistem memeriksa bentrok jadwal secara otomatis dan membuat ruang video call terenkripsi untuk sesi online.
                      </p>
                    </div>
                    {reschedulingId && (
                      <button
                        type="button"
                        onClick={() => setReschedulingId(null)}
                        className="text-xs font-semibold text-[#315E4B] underline"
                      >
                        Batal Ubah Jadwal
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleCreateOrUpdateSchedule} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                          Pengajuan Mahasiswa
                        </label>
                        <select
                          required
                          disabled={Boolean(reschedulingId)}
                          value={schedRequestId}
                          onChange={(e) => {
                            const r = requests.find((item) => item.id === e.target.value);
                            setSchedRequestId(e.target.value);
                            if (r) {
                              setSchedDate(r.preferredDate);
                              setSchedStart(r.preferredTime);
                              setSchedMethod(r.method);
                              if (r.assignedCounselorUid) setSchedCounselorUid(r.assignedCounselorUid);
                            }
                          }}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          <option value="">-- Pilih Pengajuan --</option>
                          {requests
                            .filter((r) => !['completed', 'cancelled', 'rejected'].includes(r.status))
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.studentName} ({r.nim}) · {CATEGORY_LABELS[r.category]} · {r.preferredDate}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Konselor</label>
                        <select
                          required
                          value={schedCounselorUid}
                          onChange={(e) => setSchedCounselorUid(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          <option value="">-- Pilih Konselor Aktif --</option>
                          {counselors
                            .filter((c) => c.isActive)
                            .map((c) => (
                              <option key={c.uid} value={c.uid}>
                                {c.fullName} ({c.availability[0] || 'Tersedia'})
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Tanggal Sesi</label>
                        <input
                          type="date"
                          required
                          value={schedDate}
                          onChange={(e) => setSchedDate(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Jam Mulai (WIB)</label>
                          <input
                            type="time"
                            required
                            value={schedStart}
                            onChange={(e) => setSchedStart(e.target.value)}
                            className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-2.5 text-sm tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Durasi (Menit)</label>
                          <select
                            value={schedDuration}
                            onChange={(e) => setSchedDuration(Number(e.target.value))}
                            className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-2.5 text-sm tabular-nums"
                          >
                            <option value={30}>30 menit</option>
                            <option value={45}>45 menit</option>
                            <option value={60}>60 menit</option>
                            <option value={90}>90 menit</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Metode Konseling</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['online', 'offline'] as CounselingMethod[]).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSchedMethod(m)}
                              className={`rounded-xl border py-2.5 text-xs font-semibold ${
                                schedMethod === m
                                  ? 'border-[#315E4B] bg-[#315E4B] text-white'
                                  : 'border-[#D4E0D5] bg-[#FAF8F3] text-[#35443C]'
                              }`}
                            >
                              {m === 'online' ? 'Online (Video Call)' : 'Offline (Tatap Muka)'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {schedMethod === 'offline' && (
                        <div>
                          <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Ruangan Lab BK</label>
                          <input
                            type="text"
                            value={schedLocation}
                            onChange={(e) => setSchedLocation(e.target.value)}
                            className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      {reschedulingId ? 'Simpan Perubahan Jadwal' : 'Tetapkan Jadwal & Kirim Konfirmasi'}
                    </button>
                  </form>
                </section>

                {/* Calendar Harian / Mingguan / Bulanan */}
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-lg font-bold text-[#1E2B24]">Kalender Jadwal Konseling</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="date"
                        value={calendarDate}
                        onChange={(e) => setCalendarDate(e.target.value)}
                        className="rounded-lg border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-1.5 text-xs tabular-nums"
                      />
                      <div className="flex rounded-lg bg-[#EAE3D2]/60 p-1">
                        {(['daily', 'weekly', 'monthly'] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setCalendarMode(mode)}
                            className={`rounded-md px-3 py-1 text-xs font-medium ${
                              calendarMode === mode ? 'bg-white text-[#315E4B] shadow-sm' : 'text-[#45564D]'
                            }`}
                          >
                            {mode === 'daily' ? 'Harian' : mode === 'weekly' ? 'Mingguan' : 'Bulanan'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {visibleCalendarSchedules.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Tidak ada jadwal pada rentang waktu yang dipilih.</p>
                  ) : (
                    <div className="space-y-3">
                      {visibleCalendarSchedules.map((s) => (
                        <div
                          key={s.id}
                          className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 flex flex-wrap items-center justify-between gap-4"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-[#596B61]">
                              <span className="font-semibold text-[#315E4B]">{SCHEDULE_STATUS_LABELS[s.status]}</span>
                              <span>·</span>
                              <span className="capitalize">{s.method}</span>
                              <span>·</span>
                              <span>{CATEGORY_LABELS[s.category]}</span>
                            </div>
                            <p className="text-sm font-bold text-[#1E2B24]">
                              {s.studentName} → Konselor: {s.counselorName}
                            </p>
                            <p className="text-xs text-[#45564D] tabular-nums">
                              {formatDateId(s.date)} · {s.startTime}–{s.endTime} WIB
                            </p>
                            {s.rescheduleNote && (
                              <p className="text-xs text-amber-800">Usulan ubah jadwal: {s.rescheduleNote}</p>
                            )}
                          </div>
                          {s.status !== 'completed' && s.status !== 'cancelled' && (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReschedulingId(s.id);
                                  setSchedRequestId(s.requestId);
                                  setSchedCounselorUid(s.counselorUid);
                                  setSchedDate(s.date);
                                  setSchedStart(s.startTime);
                                  setSchedDuration(s.durationMinutes);
                                  setSchedMethod(s.method);
                                  setSchedLocation(s.locationOrRoom || '');
                                }}
                                className="rounded-lg border border-[#C6D4C8] bg-white px-3 py-1.5 text-xs font-semibold text-[#315E4B]"
                              >
                                Jadwal Ulang
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelSchedule(s)}
                                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                              >
                                Batalkan
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* 6. Ruang Konseling Online */}
            {activeTab === 'videorooms' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                <div className="flex items-start gap-3">
                  <ShieldAlert className="h-5 w-5 text-[#315E4B] shrink-0 mt-0.5" />
                  <div>
                    <h1 className="text-xl font-bold text-[#1E2B24]">Pemantauan Status Ruang Konseling Online</h1>
                    <p className="text-xs text-[#596B61] mt-1">
                      Admin hanya memantau status ketersediaan dan waktu aktif ruang video call. Admin tidak memiliki izin memasuki ruang percakapan privat antara mahasiswa dan konselor.
                    </p>
                  </div>
                </div>

                {videoRooms.length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada ruang video call online yang dibuat.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                          <th className="py-2.5 pr-4 font-semibold">Kode Ruang</th>
                          <th className="py-2.5 pr-4 font-semibold">Jadwal Terkait</th>
                          <th className="py-2.5 pr-4 font-semibold">Masa Berlaku</th>
                          <th className="py-2.5 pr-4 font-semibold">Status Ruang</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE3D2]">
                        {videoRooms.map((vr) => {
                          const sch = schedules.find((s) => s.id === vr.scheduleId);
                          return (
                            <tr key={vr.id}>
                              <td className="py-3 pr-4 font-mono text-xs font-semibold text-[#315E4B]">{vr.roomCode}</td>
                              <td className="py-3 pr-4 text-xs">
                                {sch ? `${sch.studentName} & ${sch.counselorName} (${sch.date})` : vr.scheduleId}
                              </td>
                              <td className="py-3 pr-4 text-xs tabular-nums text-[#596B61]">
                                {sch ? `${sch.startTime}–${sch.endTime} WIB` : vr.validFrom}
                              </td>
                              <td className="py-3 pr-4 text-xs font-semibold capitalize text-[#1E2B24]">{vr.status}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {videoLogs.length > 0 && (
                  <div className="pt-4 border-t border-[#EAE3D2] space-y-2">
                    <h2 className="text-sm font-bold text-[#1E2B24]">Log Aktivitas Kehadiran Ruang</h2>
                    <div className="space-y-1.5 text-xs text-[#45564D]">
                      {videoLogs.slice(0, 10).map((vl) => (
                        <div key={vl.id} className="flex justify-between">
                          <span>
                            {vl.participantRole === 'counselor' ? 'Konselor' : 'Mahasiswa'} · Event: {vl.eventType}
                          </span>
                          <span className="tabular-nums text-[#596B61]">{formatTimestampId(vl.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 7. Riwayat Pelayanan */}
            {activeTab === 'history' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                <h1 className="text-xl font-bold text-[#1E2B24]">Riwayat Pelayanan Konseling (Administratif)</h1>
                {schedules.filter((s) => s.status === 'completed' || s.status === 'cancelled').length === 0 ? (
                  <p className="text-sm text-[#596B61]">Belum ada sesi selesai atau dibatalkan.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-[#EAE3D2] text-xs text-[#596B61]">
                          <th className="py-2 pr-4 font-semibold">Tanggal</th>
                          <th className="py-2 pr-4 font-semibold">Mahasiswa</th>
                          <th className="py-2 pr-4 font-semibold">Konselor</th>
                          <th className="py-2 pr-4 font-semibold">Bidang</th>
                          <th className="py-2 pr-4 font-semibold">Metode</th>
                          <th className="py-2 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EAE3D2]">
                        {schedules
                          .filter((s) => s.status === 'completed' || s.status === 'cancelled')
                          .map((s) => (
                            <tr key={s.id}>
                              <td className="py-2.5 pr-4 tabular-nums text-xs">{s.date}</td>
                              <td className="py-2.5 pr-4 font-medium">{s.studentName}</td>
                              <td className="py-2.5 pr-4">{s.counselorName}</td>
                              <td className="py-2.5 pr-4">{CATEGORY_LABELS[s.category]}</td>
                              <td className="py-2.5 pr-4 capitalize">{s.method}</td>
                              <td className="py-2.5 font-semibold text-[#315E4B]">{SCHEDULE_STATUS_LABELS[s.status]}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* 8. Artikel dan Edukasi */}
            {activeTab === 'articles' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h1 className="text-xl font-bold text-[#1E2B24]">
                    {editingArtId ? 'Edit Artikel Edukasi' : 'Tambah Artikel Edukasi BK'}
                  </h1>
                  <form onSubmit={handleSaveArticle} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Judul Artikel</label>
                        <input
                          type="text"
                          required
                          value={artTitle}
                          onChange={(e) => setArtTitle(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Kategori</label>
                        <select
                          value={artCategory}
                          onChange={(e) => setArtCategory(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        >
                          <option value="Kesehatan Mental">Kesehatan Mental</option>
                          <option value="Manajemen Stres">Manajemen Stres</option>
                          <option value="Pengembangan Diri">Pengembangan Diri</option>
                          <option value="Akademik & Karier">Akademik & Karier</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Penulis</label>
                        <input
                          type="text"
                          required
                          value={artAuthor}
                          onChange={(e) => setArtAuthor(e.target.value)}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Estimasi Baca (Menit)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={artMinutes}
                          onChange={(e) => setArtMinutes(Number(e.target.value))}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Ringkasan Singkat</label>
                      <input
                        type="text"
                        value={artExcerpt}
                        onChange={(e) => setArtExcerpt(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Konten Artikel</label>
                      <textarea
                        rows={5}
                        required
                        value={artContent}
                        onChange={(e) => setArtContent(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={artPublished}
                        onChange={(e) => setArtPublished(e.target.checked)}
                        className="accent-[#315E4B]"
                      />
                      <span>Publikasikan langsung di halaman Artikel</span>
                    </label>
                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                    >
                      {editingArtId ? 'Simpan Perubahan Artikel' : 'Terbitkan Artikel'}
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-3">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Daftar Artikel di Database</h2>
                  {articles.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada artikel kustom tersimpan (halaman publik menampilkan artikel contoh).</p>
                  ) : (
                    articles.map((a) => (
                      <div key={a.id} className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 flex items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-[#1E2B24]">{a.title}</p>
                          <p className="text-xs text-[#596B61]">
                            {a.category} · {a.published ? 'Dipublikasikan' : 'Draf'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingArtId(a.id);
                              setArtTitle(a.title);
                              setArtCategory(a.category);
                              setArtExcerpt(a.excerpt);
                              setArtContent(a.content);
                              setArtAuthor(a.authorName);
                              setArtMinutes(a.readMinutes);
                              setArtPublished(a.published);
                            }}
                            className="font-semibold text-[#315E4B] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDoc(doc(db, 'articles', a.id))}
                            className="text-red-700 hover:underline"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </section>
              </div>
            )}

            {/* 9. Manajemen Konten Website */}
            {activeTab === 'content' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-5">
                <h1 className="text-xl font-bold text-[#1E2B24]">Manajemen Konten Profil Lab BK UNUGHA</h1>
                <form onSubmit={handleSaveCmsAndSettings} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Nama Laboratorium</label>
                    <input
                      type="text"
                      value={cmsLabName}
                      onChange={(e) => setCmsLabName(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Profil Singkat</label>
                    <textarea
                      rows={3}
                      value={cmsDesc}
                      onChange={(e) => setCmsDesc(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Visi</label>
                      <textarea
                        rows={3}
                        value={cmsVision}
                        onChange={(e) => setCmsVision(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Tujuan Pelayanan</label>
                      <textarea
                        rows={3}
                        value={cmsGoals}
                        onChange={(e) => setCmsGoals(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Misi</label>
                    <textarea
                      rows={3}
                      value={cmsMission}
                      onChange={(e) => setCmsMission(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Alamat Lab BK</label>
                      <input
                        type="text"
                        value={cmsAddress}
                        onChange={(e) => setCmsAddress(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Jam Layanan</label>
                      <input
                        type="text"
                        value={cmsHours}
                        onChange={(e) => setCmsHours(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Email Resmi</label>
                      <input
                        type="email"
                        value={cmsEmail}
                        onChange={(e) => setCmsEmail(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#35443C] mb-1.5">Telepon / WhatsApp</label>
                      <input
                        type="text"
                        value={cmsPhone}
                        onChange={(e) => setCmsPhone(e.target.value)}
                        className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#244738]"
                  >
                    Simpan Konten Website
                  </button>
                </form>
              </section>
            )}

            {/* 10. Notifikasi */}
            {activeTab === 'notifications' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Kirim Notifikasi / Pengingat ke Pengguna</h2>
                  <form onSubmit={handleSendManualNotification} className="space-y-3">
                    <select
                      required
                      value={notifTargetUid}
                      onChange={(e) => setNotifTargetUid(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                    >
                      <option value="">-- Pilih Mahasiswa / Konselor --</option>
                      {users.map((u) => (
                        <option key={u.uid} value={u.uid}>
                          {u.displayName} ({u.role}) - {u.email}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      required
                      placeholder="Judul Notifikasi"
                      value={notifTitle}
                      onChange={(e) => setNotifTitle(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm"
                    />
                    <textarea
                      rows={2}
                      required
                      placeholder="Isi pesan pengingat jadwal atau informasi..."
                      value={notifBody}
                      onChange={(e) => setNotifBody(e.target.value)}
                      className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] p-3 text-sm"
                    />
                    <button
                      type="submit"
                      className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white"
                    >
                      Kirim Notifikasi
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-3">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Kotak Masuk Notifikasi Admin</h2>
                  {notifications.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada notifikasi.</p>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        className={`rounded-xl border p-4 flex items-start justify-between gap-4 ${
                          n.isRead ? 'border-[#EAE3D2] bg-white' : 'border-[#A3B8A5] bg-[#EBF0EC]/60'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-[#1E2B24]">{n.title}</p>
                          <p className="text-sm text-[#45564D]">{n.message}</p>
                          <p className="text-xs text-[#596B61] mt-1">{formatTimestampId(n.createdAt)}</p>
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
                    ))
                  )}
                </section>
              </div>
            )}

            {/* 11. Laporan dan Statistik */}
            {activeTab === 'reports' && (
              <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 sm:p-8 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-[#1E2B24]">Laporan dan Statistik Pelayanan</h1>
                    <p className="text-xs text-[#596B61] mt-1">
                      Laporan hanya berisi data statistik dan administratif tanpa isi percakapan maupun catatan konseling privat.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#315E4B] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#244738]"
                    >
                      <FileSpreadsheet className="h-4 w-4" />
                      <span>Ekspor Excel (.xlsx)</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      className="inline-flex items-center gap-2 rounded-xl border border-[#315E4B] bg-white px-4 py-2.5 text-xs font-semibold text-[#315E4B] hover:bg-[#EBF0EC]"
                    >
                      <FileText className="h-4 w-4" />
                      <span>Ekspor PDF (.pdf)</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 space-y-3">
                    <h2 className="text-sm font-bold text-[#1E2B24]">Rekap Bidang Layanan BK</h2>
                    {(['pribadi', 'sosial', 'belajar', 'karier'] as CounselingCategory[]).map((c) => (
                      <div key={c} className="flex justify-between text-sm">
                        <span>{CATEGORY_LABELS[c]}</span>
                        <span className="font-mono font-semibold tabular-nums">{analytics.byCategory[c]}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-5 space-y-3">
                    <h2 className="text-sm font-bold text-[#1E2B24]">Rekap Pelayanan per Konselor</h2>
                    {analytics.byCounselor.length === 0 ? (
                      <p className="text-xs text-[#596B61]">Belum ada data sesi konselor.</p>
                    ) : (
                      analytics.byCounselor.map(([name, count]) => (
                        <div key={name} className="flex justify-between text-sm">
                          <span>{name}</span>
                          <span className="font-mono font-semibold tabular-nums">{count} sesi</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 12. Pengaturan Website & Audit Logs */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-5">
                  <h1 className="text-xl font-bold text-[#1E2B24]">Pengaturan Kebijakan Retensi & Ruang Video</h1>
                  <form onSubmit={handleSaveCmsAndSettings} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                          Masa Retensi Data Administratif (Hari)
                        </label>
                        <input
                          type="number"
                          min={30}
                          max={3650}
                          value={setRetentionDays}
                          onChange={(e) => setSetRetentionDays(Number(e.target.value))}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-[#35443C] mb-1.5">
                          Pembukaan Ruang Video Call Sebelum Jadwal (Menit)
                        </label>
                        <input
                          type="number"
                          min={5}
                          max={60}
                          value={setVideoWindow}
                          onChange={(e) => setSetVideoWindow(Number(e.target.value))}
                          className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3.5 py-2.5 text-sm tabular-nums"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="submit"
                        className="rounded-xl bg-[#315E4B] px-5 py-2.5 text-sm font-semibold text-white"
                      >
                        Simpan Pengaturan
                      </button>
                      <button
                        type="button"
                        onClick={handleExportAdminJsonBackup}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#C6D4C8] bg-[#FAF8F3] px-4 py-2.5 text-sm font-medium text-[#315E4B]"
                      >
                        <Download className="h-4 w-4" />
                        <span>Cadangkan Data Administratif (JSON)</span>
                      </button>
                    </div>
                  </form>
                </section>

                <section className="rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
                  <h2 className="text-lg font-bold text-[#1E2B24]">Log Audit Aktivitas Admin</h2>
                  {auditLogs.length === 0 ? (
                    <p className="text-sm text-[#596B61]">Belum ada catatan aktivitas administratif.</p>
                  ) : (
                    <div className="divide-y divide-[#EAE3D2] text-xs">
                      {auditLogs.slice(0, 20).map((log) => (
                        <div key={log.id} className="py-2.5 flex flex-wrap justify-between gap-2">
                          <div>
                            <span className="font-semibold text-[#315E4B]">{log.action}</span> ·{' '}
                            <span>{log.details}</span>
                          </div>
                          <span className="text-[#596B61] tabular-nums">
                            {log.adminEmail} · {formatTimestampId(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Request Verification & Counselor Assignment Modal */}
      {detailRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-[#EAE3D2] bg-white p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-[#315E4B]">Detail Administratif Pengajuan</p>
                <h3 className="text-lg font-bold text-[#1E2B24]">{detailRequest.studentName}</h3>
                <p className="text-xs text-[#596B61] font-mono tabular-nums">
                  NIM {detailRequest.nim} · {detailRequest.studyProgram} · Semester {detailRequest.semester}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailRequest(null)}
                className="rounded-lg border border-[#EAE3D2] px-3 py-1 text-xs"
              >
                Tutup
              </button>
            </div>

            <div className="rounded-xl border border-[#EAE3D2] bg-[#FAF8F3] p-4 text-xs space-y-1.5 text-[#35443C]">
              <p>Bidang: <strong>{CATEGORY_LABELS[detailRequest.category]}</strong></p>
              <p>Metode: <strong className="capitalize">{detailRequest.method}</strong></p>
              <p>Preferensi Jadwal: <strong className="tabular-nums">{detailRequest.preferredDate} pukul {detailRequest.preferredTime} WIB</strong></p>
              <p>Persetujuan Privasi: <strong>{detailRequest.privacyConsent ? 'Disetujui' : 'Belum'}</strong></p>
              <p className="text-[#596B61] pt-1">
                * Isi cerita pribadi mahasiswa terlindungi dan hanya ditampilkan kepada konselor yang ditugaskan.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#35443C] mb-1">Tugaskan Konselor</label>
              <select
                value={modalCounselorUid}
                onChange={(e) => setModalCounselorUid(e.target.value)}
                className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-2 text-sm"
              >
                <option value="">-- Pilih Konselor --</option>
                {counselors
                  .filter((c) => c.isActive)
                  .map((c) => (
                    <option key={c.uid} value={c.uid}>
                      {c.fullName} ({c.specializations.join(', ')})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#35443C] mb-1">Catatan Administratif (Opsional)</label>
              <input
                type="text"
                value={modalAdminNote}
                onChange={(e) => setModalAdminNote(e.target.value)}
                className="w-full rounded-xl border border-[#D4E0D5] bg-[#FAF8F3] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleUpdateRequestStatus(detailRequest, 'verifying', modalCounselorUid)}
                className="rounded-lg border border-[#C6D4C8] px-3 py-2 text-xs font-semibold text-[#315E4B]"
              >
                Tandai Verifikasi
              </button>
              <button
                type="button"
                onClick={() => handleUpdateRequestStatus(detailRequest, 'approved', modalCounselorUid)}
                className="rounded-lg bg-[#315E4B] px-3.5 py-2 text-xs font-semibold text-white"
              >
                Setujui & Tugaskan Konselor
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = detailRequest;
                  setDetailRequest(null);
                  setSchedRequestId(target.id);
                  setSchedCounselorUid(modalCounselorUid || target.assignedCounselorUid || counselors[0]?.uid || '');
                  setSchedDate(target.preferredDate);
                  setSchedStart(target.preferredTime);
                  setSchedMethod(target.method);
                  setActiveTab('schedules');
                }}
                className="rounded-lg bg-[#244738] px-3.5 py-2 text-xs font-semibold text-white"
              >
                Lanjut Jadwalkan
              </button>
            </div>

            <div className="pt-3 border-t border-[#EAE3D2] flex gap-2">
              <input
                type="text"
                placeholder="Alasan penolakan (jika ditolak)..."
                value={modalRejectReason}
                onChange={(e) => setModalRejectReason(e.target.value)}
                className="flex-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs"
              />
              <button
                type="button"
                onClick={() => {
                  if (!modalRejectReason.trim()) {
                    pushToast('Isi Alasan', 'Masukkan alasan penolakan terlebih dahulu.', 'error');
                    return;
                  }
                  handleUpdateRequestStatus(detailRequest, 'rejected', undefined, modalRejectReason);
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
