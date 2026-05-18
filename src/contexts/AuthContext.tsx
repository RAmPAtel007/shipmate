'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithGoogle,
  signInWithEmail,
  signOut,
  getUserProfile,
  handleGoogleRedirectResult,
} from '@/lib/firebase/auth';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateUser } from '@/lib/types';

// ─── CONTEXT TYPES ────────────────────────────────────────────────────────────

interface AuthContextType {
  currentUser: ShipmateUser | null;
  firebaseUser: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signInAdmin: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

// ─── CONTEXT ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  firebaseUser: null,
  loading: true,
  error: null,
  signIn: async () => {},
  signInAdmin: async () => {},
  signOutUser: async () => {},
  refreshUser: async () => {},
});

// ─── PROVIDER ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<ShipmateUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Holds the live Firestore listener for the logged-in user's profile doc
  const profileUnsubRef = useRef<(() => void) | null>(null);

  // On mount, process a pending Google redirect result (mobile / popup-blocked flow)
  useEffect(() => {
    handleGoogleRedirectResult().then(user => {
      if (user) setCurrentUser(user);
    }).catch(err => {
      const msg = err?.message ?? 'Sign in failed after redirect.';
      setError(msg);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (fbUser) => {
      // Cancel any existing profile listener before switching users
      profileUnsubRef.current?.();
      profileUnsubRef.current = null;

      setFirebaseUser(fbUser);

      if (fbUser) {
        // Refresh session cookie on every auth state restore (keeps 15-day window alive)
        const FIFTEEN_DAYS = 15 * 24 * 60 * 60;
        fbUser.getIdToken().then(token => {
          document.cookie = `shipmate_session=${token}; path=/; max-age=${FIFTEEN_DAYS}; samesite=strict`;
        });

        try {
          let profile = await getUserProfile(fbUser.uid);

          // Race condition on first login — profile write may not have landed yet.
          // Retry up to 3 times with short delays before giving up.
          if (!profile) {
            for (let i = 0; i < 3; i++) {
              await new Promise(res => setTimeout(res, 800));
              profile = await getUserProfile(fbUser.uid);
              if (profile) break;
            }
          }

          if (!profile) {
            // Still not found after retries — let handleSignIn set it
            setLoading(false);
            return;
          }

          if (profile.status === 'inactive') {
            await signOut();
            setCurrentUser(null);
            setFirebaseUser(null);
            setError('Your account has been deactivated. Please contact HR.');
            setLoading(false);
            return;
          }

          setCurrentUser(profile);
          setError(null);

          // ── Live profile listener ───────────────────────────────────────────
          // After the initial load, subscribe to real-time changes so that when
          // an admin updates this user's profile (name, role, department, etc.)
          // the change propagates instantly without requiring a page refresh.
          profileUnsubRef.current = onSnapshot(
            doc(db, 'users', fbUser.uid),
            snap => {
              if (!snap.exists()) return;
              const updated = { uid: snap.id, ...snap.data() } as ShipmateUser;
              if (updated.status === 'inactive') {
                // Account deactivated by admin — force sign out
                signOut();
                setCurrentUser(null);
                setFirebaseUser(null);
                setError('Your account has been deactivated. Please contact HR.');
              } else {
                setCurrentUser(updated);
              }
            },
            err => console.error('[AuthContext] profile listener error:', err),
          );
        } catch (err) {
          console.error('[AuthContext] Failed to load user profile:', err);
          setError('Failed to load your profile. Please try again.');
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
      }

      setLoading(false);
    });

    return () => {
      unsubscribe();
      profileUnsubRef.current?.();
      profileUnsubRef.current = null;
    };
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      const user = await signInWithGoogle();
      // null means redirect was triggered — page will reload, result handled on mount
      if (user) setCurrentUser(user);
    } catch (err: any) {
      const msg = err?.message ?? 'Sign in failed. Please try again.';
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignInAdmin = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const user = await signInWithEmail(email, password);
      setCurrentUser(user);
    } catch (err: any) {
      const msg = err?.message ?? 'Sign in failed. Please try again.';
      setError(msg);
      throw err;
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setCurrentUser(null);
    setFirebaseUser(null);
    setError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const profile = await getUserProfile(firebaseUser.uid);
      if (profile) setCurrentUser(profile);
    } catch (err) {
      console.error('[AuthContext] Failed to refresh user:', err);
    }
  }, [firebaseUser]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        firebaseUser,
        loading,
        error,
        signIn: handleSignIn,
        signInAdmin: handleSignInAdmin,
        signOutUser: handleSignOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ─── HOOK ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
