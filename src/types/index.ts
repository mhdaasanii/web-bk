export type UserRole = 'student' | 'counselor' | 'admin';

export type CounselingCategory = 'pribadi' | 'sosial' | 'belajar' | 'karier';
export type CounselingMethod = 'online' | 'offline';

export type RequestStatus =
  | 'new'
  | 'verifying'
  | 'approved'
  | 'awaiting_schedule'
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'rejected';

export type ScheduleStatus =
  | 'confirmed'
  | 'reschedule_requested'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface UserAccount {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  photoUrl?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface StudentProfile {
  uid: string;
  fullName: string;
  nim: string;
  studyProgram: string;
  semester: number;
  phone?: string;
  emergencyContact?: string;
  privacyConsentAccepted: boolean;
  consentAcceptedAt?: any;
  createdAt?: any;
  updatedAt?: any;
}

export interface CounselorProfile {
  uid: string;
  fullName: string;
  title: string;
  specializations: string[];
  bio?: string;
  photoUrl?: string;
  isActive: boolean;
  availability: string[];
  maxWeeklySessions?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface CounselorInvite {
  id: string;
  email: string;
  fullName: string;
  title: string;
  specializations: string[];
  bio?: string;
  availability: string[];
  isActive: boolean;
  createdBy: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CounselingRequest {
  id: string;
  uid: string;
  studentName: string;
  nim: string;
  studyProgram: string;
  semester: number;
  category: CounselingCategory;
  method: CounselingMethod;
  preferredDate: string;
  preferredTime: string;
  privacyConsent: boolean;
  status: RequestStatus;
  assignedCounselorUid?: string;
  assignedCounselorName?: string;
  adminNote?: string;
  rejectionReason?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface RequestPrivateDetail {
  uid: string;
  issueSummary: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface CounselingSchedule {
  id: string;
  requestId: string;
  studentUid: string;
  studentName: string;
  nim?: string;
  studyProgram?: string;
  counselorUid: string;
  counselorName: string;
  category: CounselingCategory;
  method: CounselingMethod;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  locationOrRoom?: string;
  status: ScheduleStatus;
  rescheduleNote?: string;
  videoRoomId?: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface VideoRoom {
  id: string;
  scheduleId: string;
  studentUid: string;
  counselorUid: string;
  roomCode: string;
  status: 'ready' | 'active' | 'ended' | 'expired';
  validFrom: string;
  validUntil: string;
  startedAt?: string;
  endedAt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface VideoSessionLog {
  id: string;
  roomId: string;
  scheduleId: string;
  participantUid: string;
  participantRole: 'student' | 'counselor';
  eventType: 'joined' | 'reconnected' | 'left' | 'ended';
  createdAt?: any;
}

export interface PrivateNote {
  id: string;
  scheduleId: string;
  requestId?: string;
  studentUid: string;
  studentName: string;
  counselorUid: string;
  counselorName?: string;
  sessionSummary: string;
  observations?: string;
  followUpPlan?: string;
  nextActionDate?: string;
  riskLevel: 'rendah' | 'sedang' | 'tinggi';
  createdAt?: any;
  updatedAt?: any;
}

export interface FollowUp {
  id: string;
  scheduleId: string;
  studentUid: string;
  counselorUid: string;
  counselorName: string;
  planTitle: string;
  actionItems: string;
  targetDate?: string;
  status: 'aktif' | 'selesai';
  createdAt?: any;
  updatedAt?: any;
}

export interface JournalEntry {
  id: string;
  uid: string;
  title: string;
  content: string;
  reflectionPrompt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export type MoodType = 'senang' | 'tenang' | 'biasa' | 'cemas' | 'lelah' | 'sedih';

export interface MoodEntry {
  id: string;
  uid: string;
  mood: MoodType;
  intensity: number;
  note?: string;
  date: string;
  createdAt?: any;
}

export interface AssessmentResult {
  id: string;
  uid: string;
  stressScore: number;
  academicScore: number;
  socialScore: number;
  careerScore: number;
  recommendedService: CounselingCategory;
  summaryLabel: string;
  createdAt?: any;
}

export interface Article {
  id: string;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  coverImage?: string;
  authorName: string;
  readMinutes: number;
  published: boolean;
  createdAt?: any;
  updatedAt?: any;
}

export interface SiteAboutContent {
  key: string;
  labName: string;
  aboutDescription: string;
  vision: string;
  mission: string;
  goals: string;
  address: string;
  contactEmail: string;
  contactPhone: string;
  serviceHours: string;
  retentionDays?: number;
  videoWindowMinutesBefore?: number;
  updatedAt?: any;
}

export interface AppNotification {
  id: string;
  targetUid: string;
  targetRole: UserRole;
  title: string;
  message: string;
  type: 'request' | 'schedule' | 'video' | 'session' | 'system';
  isRead: boolean;
  createdAt?: any;
}

export interface AdminActivityLog {
  id: string;
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt?: any;
}

export const CATEGORY_LABELS: Record<CounselingCategory, string> = {
  pribadi: 'Konseling Pribadi',
  sosial: 'Konseling Sosial',
  belajar: 'Konseling Belajar',
  karier: 'Konseling Karier',
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  new: 'Pengajuan Baru',
  verifying: 'Menunggu Verifikasi',
  approved: 'Disetujui',
  awaiting_schedule: 'Menunggu Penjadwalan',
  scheduled: 'Sudah Dijadwalkan',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
  rejected: 'Ditolak',
};

export const SCHEDULE_STATUS_LABELS: Record<ScheduleStatus, string> = {
  confirmed: 'Dikonfirmasi',
  reschedule_requested: 'Usulan Ubah Jadwal',
  in_progress: 'Sedang Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};
