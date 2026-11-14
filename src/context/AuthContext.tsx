import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleAuthProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase.ts';
import { BOOTSTRAP_ADMIN_EMAIL, DEFAULT_ABOUT_CONTENT } from '../lib/seedContent.ts';
import {
  AppNotification,
  CounselorProfile,
  SiteAboutContent,
  StudentProfile,
  UserAccount,
  UserRole,
} from '../types/index.ts';

interface ToastMessage {
  id: string;
  title: string;
  message: string;
  variant?: 'info' | 'success' | 'error';
}

interface AuthContextValue {
  firebaseUser: User | null;
  userAccount: UserAccount | null;
  studentProfile: StudentProfile | null;
  counselorProfile: CounselorProfile | null;
  notifications: AppNotification[];
  unreadCount: number;
  siteAbout: SiteAboutContent;
  authReady: boolean;
  loadingAuth: boolean;
  needsStudentOnboarding: boolean;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  pushToast: (title: string, message: string, variant?: 'info' | 'success' | 'error') => void;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  markNotificationRead: (notifId: string) => Promise<void>;
  sendNotification: (params: {
    targetUid: string;
    targetRole: UserRole;
    title: string;
    message: string;
    type: AppNotification['type'];
  }) => Promise<void>;
  logAdminAction: (action: string, targetType: string, targetId: string, details: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userAccount, setUserAccount] = useState<UserAccount | null>(null);
  const [studentProfile, setStudentProfile] = useState<StudentProfile | null>(null);
  const [counselorProfile, setCounselorProfile] = useState<CounselorProfile | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [siteAbout, setSiteAbout] = useState<SiteAboutContent>(DEFAULT_ABOUT_CONTENT);
  const [authReady, setAuthReady] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, message: string, variant: 'info' | 'success' | 'error' = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    },
    []
  );

  // Subscribe to public siteContent/about
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'siteContent', 'about'),
      (snap) => {
        if (snap.exists()) {
          setSiteAbout({ ...DEFAULT_ABOUT_CONTENT, ...(snap.data() as SiteAboutContent) });
        }
      },
      () => {
        // Fallback silently to default content on initial unseeded state
      }
    );
    return () => unsub();
  }, []);

  const syncUserAccount = useCallback(async (user: User) => {
    const email = (user.email || '').toLowerCase();
    const userRef = doc(db, 'users', user.uid);
    let existingSnap;
    try {
      existingSnap = await getDoc(userRef);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
    }

    if (existingSnap && existingSnap.exists()) {
      const account = existingSnap.data() as UserAccount;
      // Ensure bootstrap admin always has admin doc
      if (email === BOOTSTRAP_ADMIN_EMAIL && account.role === 'admin') {
        const adminSnap = await getDoc(doc(db, 'admins', user.uid));
        if (!adminSnap.exists()) {
          await setDoc(doc(db, 'admins', user.uid), {
            uid: user.uid,
            email,
            displayName: account.displayName,
            role: 'admin',
            isActive: true,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      }
      setUserAccount(account);
      return account;
    }

    // First-time registration: determine authorized role
    let assignedRole: UserRole = 'student';
    let inviteData: any = null;

    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      assignedRole = 'admin';
    } else if (email) {
      try {
        const inviteSnap = await getDoc(doc(db, 'counselorInvites', email));
        if (inviteSnap.exists()) {
          assignedRole = 'counselor';
          inviteData = inviteSnap.data();
        }
      } catch {
        // Not an invited counselor
      }
    }

    const newAccountPayload = {
      uid: user.uid,
      email,
      displayName: user.displayName || email.split('@')[0] || 'Pengguna UNUGHA',
      role: assignedRole,
      isActive: true,
      photoUrl: user.photoURL || '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    try {
      await setDoc(userRef, newAccountPayload);
      if (assignedRole === 'admin') {
        await setDoc(doc(db, 'admins', user.uid), newAccountPayload);
      } else if (assignedRole === 'counselor' && inviteData) {
        await setDoc(doc(db, 'counselorProfiles', user.uid), {
          uid: user.uid,
          fullName: inviteData.fullName || newAccountPayload.displayName,
          title: inviteData.title || 'Konselor Lab BK UNUGHA',
          specializations: inviteData.specializations || ['Pribadi'],
          bio: inviteData.bio || '',
          photoUrl: user.photoURL || '',
          isActive: inviteData.isActive ?? true,
          availability: inviteData.availability || ['Senin 09:00-12:00'],
          maxWeeklySessions: 12,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
    }

    const createdSnap = await getDoc(userRef);
    const createdAccount = createdSnap.data() as UserAccount;
    setUserAccount(createdAccount);
    return createdAccount;
  }, []);

  const loadRoleProfile = useCallback(async (account: UserAccount) => {
    if (account.role === 'student') {
      try {
        const snap = await getDoc(doc(db, 'studentProfiles', account.uid));
        setStudentProfile(snap.exists() ? (snap.data() as StudentProfile) : null);
      } catch {
        setStudentProfile(null);
      }
      setCounselorProfile(null);
    } else if (account.role === 'counselor') {
      try {
        const snap = await getDoc(doc(db, 'counselorProfiles', account.uid));
        setCounselorProfile(snap.exists() ? (snap.data() as CounselorProfile) : null);
      } catch {
        setCounselorProfile(null);
      }
      setStudentProfile(null);
    } else {
      setStudentProfile(null);
      setCounselorProfile(null);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!firebaseUser) return;
    const acc = await syncUserAccount(firebaseUser);
    if (acc) await loadRoleProfile(acc);
  }, [firebaseUser, syncUserAccount, loadRoleProfile]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          const acc = await syncUserAccount(user);
          if (acc) await loadRoleProfile(acc);
        } catch (err) {
          console.error('Failed to sync user profile:', err);
        }
      } else {
        setUserAccount(null);
        setStudentProfile(null);
        setCounselorProfile(null);
        setNotifications([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [syncUserAccount, loadRoleProfile]);

  // Real-time Firestore notification listeners
  useEffect(() => {
    if (!authReady || !firebaseUser || !userAccount) {
      setNotifications([]);
      return;
    }

    const unsubs: Array<() => void> = [];
    const personalMap = new Map<string, AppNotification>();
    const adminMap = new Map<string, AppNotification>();

    const mergeAndSet = () => {
      const merged = new Map<string, AppNotification>([...personalMap, ...adminMap]);
      const sorted = Array.from(merged.values()).sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() || 0;
        const tb = b.createdAt?.toMillis?.() || 0;
        return tb - ta;
      });
      setNotifications(sorted);
    };

    const qPersonal = query(
      collection(db, 'notifications'),
      where('targetUid', '==', firebaseUser.uid)
    );

    unsubs.push(
      onSnapshot(
        qPersonal,
        (snap) => {
          personalMap.clear();
          snap.docs.forEach((d) => personalMap.set(d.id, { id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
          mergeAndSet();
        },
        (err) => {
          console.warn('Personal notifications listener warning:', err.message);
        }
      )
    );

    if (userAccount.role === 'admin') {
      const qAdmin = query(
        collection(db, 'notifications'),
        where('targetRole', '==', 'admin')
      );
      unsubs.push(
        onSnapshot(
          qAdmin,
          (snap) => {
            adminMap.clear();
            snap.docs.forEach((d) => adminMap.set(d.id, { id: d.id, ...(d.data() as Omit<AppNotification, 'id'>) }));
            mergeAndSet();
          },
          (err) => {
            console.warn('Admin notifications listener warning:', err.message);
          }
        )
      );
    }

    return () => unsubs.forEach((u) => u());
  }, [authReady, firebaseUser, userAccount]);

  // Real-time WebSocket notification push channel
  useEffect(() => {
    if (!firebaseUser || !userAccount) return;
    let closed = false;

    const connectWs = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
        wsRef.current = ws;
        ws.onopen = () => {
          if (!closed) {
            ws.send(JSON.stringify({ type: 'notif:subscribe', idToken: token }));
          }
        };
        ws.onmessage = (ev) => {
          try {
            const payload = JSON.parse(ev.data);
            if (payload.type === 'notification:new') {
              pushToast(payload.title || 'Notifikasi Baru', payload.message || '', 'info');
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // silent fallback to Firestore onSnapshot
      }
    };

    connectWs();
    return () => {
      closed = true;
      wsRef.current?.close();
    };
  }, [firebaseUser, userAccount, pushToast]);

  const signInWithGoogle = useCallback(async () => {
    setLoadingAuth(true);
    try {
      await signInWithPopup(auth, googleAuthProvider);
      pushToast('Berhasil Masuk', 'Selamat datang di Ruang Tumbuh Laboratorium BK UNUGHA.', 'success');
    } catch (err: any) {
      const msg =
        err?.code === 'auth/popup-closed-by-user'
          ? 'Jendela login Google ditutup sebelum selesai.'
          : err?.message || 'Gagal masuk menggunakan akun Google.';
      pushToast('Gagal Masuk', msg, 'error');
      throw err;
    } finally {
      setLoadingAuth(false);
    }
  }, [pushToast]);

  const logout = useCallback(async () => {
    await signOut(auth);
    setUserAccount(null);
    setStudentProfile(null);
    setCounselorProfile(null);
    pushToast('Keluar Berhasil', 'Anda telah keluar dari akun Ruang Tumbuh.', 'info');
  }, [pushToast]);

  const markNotificationRead = useCallback(async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `notifications/${notifId}`);
    }
  }, []);

  const sendNotification = useCallback(
    async ({
      targetUid,
      targetRole,
      title,
      message,
      type,
    }: {
      targetUid: string;
      targetRole: UserRole;
      title: string;
      message: string;
      type: AppNotification['type'];
    }) => {
      try {
        await addDoc(collection(db, 'notifications'), {
          targetUid,
          targetRole,
          title: title.slice(0, 160),
          message: message.slice(0, 500),
          type,
          isRead: false,
          createdAt: serverTimestamp(),
        });
        if (firebaseUser) {
          const idToken = await firebaseUser.getIdToken();
          fetch('/api/notifications/push', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ targetUid, title, message }),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Notification send error:', err);
      }
    },
    [firebaseUser]
  );

  const logAdminAction = useCallback(
    async (action: string, targetType: string, targetId: string, details: string) => {
      if (!firebaseUser || userAccount?.role !== 'admin') return;
      try {
        await addDoc(collection(db, 'adminActivityLogs'), {
          adminUid: firebaseUser.uid,
          adminEmail: userAccount.email,
          action: action.slice(0, 120),
          targetType: targetType.slice(0, 80),
          targetId: targetId.slice(0, 128),
          details: details.slice(0, 500),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error('Admin audit log write failed:', err);
      }
    },
    [firebaseUser, userAccount]
  );

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const needsStudentOnboarding =
    Boolean(firebaseUser && userAccount?.role === 'student' && !studentProfile);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        userAccount,
        studentProfile,
        counselorProfile,
        notifications,
        unreadCount,
        siteAbout,
        authReady,
        loadingAuth,
        needsStudentOnboarding,
        toasts,
        dismissToast,
        pushToast,
        signInWithGoogle,
        logout,
        refreshProfile,
        markNotificationRead,
        sendNotification,
        logAdminAction,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
