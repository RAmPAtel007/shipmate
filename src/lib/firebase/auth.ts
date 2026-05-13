import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  type User,
} from 'firebase/auth';
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
import { auth, db } from './config';
import type { ShipmateUser, Department, UserRole } from '@/lib/types';

const ADMIN_EMAILS = ['abhishek@shipcube.com', 'admin@shipcube.com'];

const ALLOWED_DOMAIN = 'shipcube.com';

/** Sign in with Google. Throws if email is not @shipcube.com */
export async function signInWithGoogle(): Promise<ShipmateUser> {
  const provider = new GoogleAuthProvider();
  // Hint the Google account picker to @shipcube.com accounts
  provider.setCustomParameters({ hd: ALLOWED_DOMAIN });

  const result = await signInWithPopup(auth, provider);
  const user = result.user;

  if (!user.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
    await firebaseSignOut(auth);
    throw new Error(
      `Access denied. Only @${ALLOWED_DOMAIN} accounts are authorized to use SHIPMATE.`
    );
  }

  return createOrGetUserProfile(user);
}

/** Sign in with email + password — admin accounts only */
export async function signInWithEmail(email: string, password: string): Promise<ShipmateUser> {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const user = result.user;

  // 1. Try lookup by UID (correct way)
  let profile = await getUserProfile(user.uid);

  // 2. If not found, search by email field (handles wrong document ID case)
  if (!profile) {
    const q = query(collection(db, 'users'), where('email', '==', email));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingData = snap.docs[0].data();
      // Migrate: write a new doc with the correct UID
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
    throw new Error('Admin profile not found. Contact your system administrator.');
  }

  if (profile.status === 'inactive') {
    await firebaseSignOut(auth);
    throw new Error('This account has been deactivated.');
  }

  if (!['super_admin', 'hr_admin'].includes(profile.role)) {
    await firebaseSignOut(auth);
    throw new Error('Admin access only. Use Google Sign-In for regular employee access.');
  }

  // Set session cookies
  user.getIdToken().then(token => {
    document.cookie = `shipmate_session=${token}; path=/; max-age=3600; samesite=strict`;
    document.cookie = `shipmate_admin=1; path=/; max-age=3600; samesite=strict`;
  });

  return profile;
}

export async function signOut(): Promise<void> {
  document.cookie = 'shipmate_session=; path=/; max-age=0';
  document.cookie = 'shipmate_admin=; path=/; max-age=0';
  await firebaseSignOut(auth);
}

export function onAuthStateChanged(callback: (user: User | null) => void) {
  return firebaseOnAuthStateChanged(auth, callback);
}

/**
 * Creates a Firestore user profile on first login, or fetches existing one.
 * Also refreshes the session cookie for middleware.
 */
export async function createOrGetUserProfile(firebaseUser: User): Promise<ShipmateUser> {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const snap = await getDoc(userRef);

  // Set session cookie for middleware route protection
  firebaseUser.getIdToken().then(token => {
    document.cookie = `shipmate_session=${token}; path=/; max-age=3600; samesite=strict`;
  });

  if (snap.exists()) {
    // Refresh photo URL and last-seen
    await updateDoc(userRef, {
      photoURL: firebaseUser.photoURL ?? snap.data().photoURL,
      updatedAt: serverTimestamp(),
    });
    return { uid: firebaseUser.uid, ...snap.data() } as ShipmateUser;
  }

  // First login — create profile with default employee role
  const newUser: Omit<ShipmateUser, 'uid'> = {
    name: firebaseUser.displayName || firebaseUser.email!.split('@')[0],
    email: firebaseUser.email!,
    department: 'ai-team' as Department, // HR will assign correct department
    role: 'employee' as UserRole,
    photoURL: firebaseUser.photoURL,
    status: 'active',
    notificationTokens: [],
    createdAt: serverTimestamp() as any,
    updatedAt: serverTimestamp() as any,
  };

  await setDoc(userRef, newUser);
  return { uid: firebaseUser.uid, ...newUser } as ShipmateUser;
}

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
