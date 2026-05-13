'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithGoogle,
  signInWithEmail,
  signOut,
  getUserProfile,
} from '@/lib/firebase/auth';
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

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(async (fbUser) => {
      setFirebaseUser(fbUser);

      if (fbUser) {
        try {
          const profile = await getUserProfile(fbUser.uid);

          if (!profile) {
            // Profile doesn't exist yet (race condition on first login)
            setLoading(false);
            return;
          }

          if (profile.status === 'inactive') {
            // Immediately sign out deactivated users
            await signOut();
            setCurrentUser(null);
            setFirebaseUser(null);
            setError('Your account has been deactivated. Please contact HR.');
          } else {
            setCurrentUser(profile);
            setError(null);
          }
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

    return unsubscribe;
  }, []);

  const handleSignIn = useCallback(async () => {
    setError(null);
    try {
      const user = await signInWithGoogle();
      setCurrentUser(user);
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
