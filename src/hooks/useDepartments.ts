import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase/config';

export interface DepartmentInfo {
  id: string;
  name: string;
  memberCount?: number;
}

// ── Singleton state ────────────────────────────────────────────────────────────
// One Firestore listener shared across all hook instances so we don't open
// N connections when N components each call useDepartments().

let cachedDepts: DepartmentInfo[] = [];
const listeners: Array<(d: DepartmentInfo[]) => void> = [];
let firestoreUnsub: (() => void) | null = null;

/** Start or restart the Firestore listener. Only called when user is signed in. */
function startListener() {
  if (firestoreUnsub) return; // already listening
  firestoreUnsub = onSnapshot(
    collection(db, 'departments'),
    snap => {
      cachedDepts = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<DepartmentInfo, 'id'>),
      }));
      listeners.forEach(fn => fn(cachedDepts));
    },
    // On error (e.g. permission denied during sign-out), clean up so we retry on next sign-in
    () => {
      firestoreUnsub = null;
    },
  );
}

/** Stop the Firestore listener and clear cache (called on sign-out). */
function stopListener() {
  firestoreUnsub?.();
  firestoreUnsub = null;
  cachedDepts = [];
}

// Watch auth state once at module level so timing is handled globally.
// When user signs in  → start listener.
// When user signs out → stop listener + clear cache.
onAuthStateChanged(auth, user => {
  if (user) {
    startListener();
  } else {
    stopListener();
    listeners.forEach(fn => fn([]));
  }
});

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Subscribe to the `departments` Firestore collection.
 * Returns the live list and a helper that resolves a department ID → display name.
 * Safe to call in any component — all instances share one Firestore connection.
 */
export function useDepartments() {
  const [departments, setDepartments] = useState<DepartmentInfo[]>(cachedDepts);

  useEffect(() => {
    // Register this component's state setter as a listener
    listeners.push(setDepartments);
    // Seed immediately from cache (avoids flicker if data already loaded)
    if (cachedDepts.length) setDepartments([...cachedDepts]);

    return () => {
      const idx = listeners.indexOf(setDepartments);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  /** Resolve a stored department ID (e.g. "ai-team") to its current display name. */
  function getDeptName(deptId: string | undefined | null): string {
    if (!deptId) return '—';
    return departments.find(d => d.id === deptId)?.name
      ?? deptId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  return { departments, getDeptName };
}
