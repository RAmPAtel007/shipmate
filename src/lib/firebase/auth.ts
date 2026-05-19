import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail as firebaseSendPasswordReset,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db, firebaseConfig } from './config';
import type { ShipmateUser, Department, UserRole } from '@/lib/types';

const ADMIN_EMAILS = ['abhishek@shipcube.com', 'admin@shipcube.com'];

// ─── Sign in with email + password ────────────────────────────────────────────
// Works for all roles: super_admin, hr_admin, manager, employee.
// The app redirects to /admin or /home based on role after sign-in.

export async function signInWithEmail(email: string, password: string): Promise<ShipmateUser> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const user = result.user;

  // 1. Try lookup by UID
  let profile = await getUserProfile(user.uid);

  // 2. If not found, search by email field (handles migrated / legacy docs)
  if (!profile) {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingData = snap.docs[0].data();
      await setDoc(doc(db, 'users', user.uid), {
        ...existingData,
        updatedAt: serverTimestamp(),
      });
      profile = { uid: user.uid, ...existingData } as ShipmateUser;
    }
  }

  // 3. Auto-create profile for known admin emails if still not found
  if (!profile && ADMIN_EMAILS.includes(email)) {
    const adminData: Omit<ShipmateUser, 'uid'> = {
      name: email === 'abhishek@shipcube.com' ? 'Abhishek' : 'Admin',
      email,
      role: 'super_admin',
      department: 'ai-team',
      status: 'active',
      notificationTokens: [],
      createdAt: serverTimestamp() as any,
      updatedAt: serverTimestamp() as any,
    };
    await setDoc(doc(db, 'users', user.uid), adminData);
    profile = { uid: user.uid, ...adminData } as ShipmateUser;
  }

  if (!profile) {
    await firebaseSignOut(auth);
    throw new Error('Account not found. Contact HR to set up your access.');
  }

  if (profile.status === 'inactive') {
    await firebaseSignOut(auth);
    throw new Error('Your account has been deactivated. Please contact HR.');
  }

  // Set session cookie (15 days)
  const FIFTEEN_DAYS = 15 * 24 * 60 * 60;
  user.getIdToken().then(token => {
    document.cookie = `shipmate_session=${token}; path=/; max-age=${FIFTEEN_DAYS}; samesite=strict`;
    const isAdmin = ['super_admin', 'hr_admin'].includes(profile!.role);
    if (isAdmin) {
      document.cookie = `shipmate_admin=1; path=/; max-age=${FIFTEEN_DAYS}; samesite=strict`;
    }
  });

  return profile;
}

// ─── Create employee account (admin-side) ─────────────────────────────────────
// Uses a secondary Firebase App instance so the currently logged-in admin
// is NOT signed out when the new account is created.

export async function createEmployeeAccount(data: {
  name: string;
  email: string;
  password: string;
  department: Department;
  role: UserRole;
  createdBy: string;
  createdByName: string;
}): Promise<{ uid: string }> {
  // Unique name prevents collision with the primary app
  const secondaryApp = initializeApp(firebaseConfig, `emp_create_${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  let uid: string;
  try {
    const result = await createUserWithEmailAndPassword(secondaryAuth, data.email, data.password);
    uid = result.user.uid;
    // Sign out of secondary app immediately — admin remains signed into primary app
    await firebaseSignOut(secondaryAuth);
  } finally {
    await deleteApp(secondaryApp);
  }

  // Write Firestore profile using the primary db instance
  await setDoc(doc(db, 'users', uid), {
    name: data.name,
    email: data.email,
    department: data.department,
    role: data.role,
    status: 'active',
    notificationTokens: [],
    mustChangePassword: true,   // flag so we can prompt them later
    createdBy: data.createdBy,
    createdByName: data.createdByName,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { uid };
}

// ─── Sign out ──────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  document.cookie = 'shipmate_session=; path=/; max-age=0';
  document.cookie = 'shipmate_admin=; path=/; max-age=0';
  await firebaseSignOut(auth);
}

// ─── Auth state listener ───────────────────────────────────────────────────────

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return firebaseOnAuthStateChanged(auth, callback);
}

// ─── Profile helpers ───────────────────────────────────────────────────────────

export async function getUserProfile(uid: string): Promise<ShipmateUser | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as ShipmateUser;
}

export async function updateUserProfile(
  uid: string,
  data: Partial<Omit<ShipmateUser, 'uid' | 'email' | 'role' | 'status'>>
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

// ─── Password reset ────────────────────────────────────────────────────────────
// Works for both email/password accounts AND existing Google Sign-In accounts.
// Firebase will send a reset link that lets the user set (or change) their password.

export async function sendPasswordReset(email: string): Promise<void> {
  await firebaseSendPasswordReset(auth, email);
}
