import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, serverTimestamp, onSnapshot,
  type DocumentData, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateUser, Department } from '@/lib/types';

const USERS = 'users';

function mapUser(uid: string, data: DocumentData): ShipmateUser {
  return { uid, ...data } as ShipmateUser;
}

export const userService = {

  async getUser(uid: string): Promise<ShipmateUser | null> {
    const snap = await getDoc(doc(db, USERS, uid));
    return snap.exists() ? mapUser(uid, snap.data()) : null;
  },

  async getAllUsers(): Promise<ShipmateUser[]> {
    // Use a simple equality filter only — no orderBy on a different field,
    // so no composite index is needed. Sort by name client-side.
    const q = query(
      collection(db, USERS),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const users = snap.docs.map(d => mapUser(d.id, d.data()));
    return users.sort((a, b) => a.name.localeCompare(b.name));
  },

  async getUsersByDepartment(dept: Department): Promise<ShipmateUser[]> {
    const q = query(
      collection(db, USERS),
      where('department', '==', dept),
      where('status', '==', 'active')
    );
    const snap = await getDocs(q);
    const users = snap.docs.map(d => mapUser(d.id, d.data()));
    return users.sort((a, b) => a.name.localeCompare(b.name));
  },

  async createUser(uid: string, data: Partial<Omit<ShipmateUser, 'uid'>>): Promise<void> {
    await setDoc(doc(db, USERS, uid), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  async updateUser(uid: string, data: Partial<Omit<ShipmateUser, 'uid'>>): Promise<void> {
    await updateDoc(doc(db, USERS, uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  },

  /**
   * Real-time listener for all active users.
   * Fires immediately with current data, then on every change.
   */
  subscribeToUsers(callback: (users: ShipmateUser[]) => void): Unsubscribe {
    const q = query(collection(db, USERS), where('status', '==', 'active'));
    return onSnapshot(q, snap => {
      const users = snap.docs
        .map(d => mapUser(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
      callback(users);
    });
  },

  /**
   * Find users whose birthday month+day matches today.
   * We store birthday as 'YYYY-MM-DD'; match on '--MM-DD' suffix.
   */
  async getTodaysBirthdays(): Promise<ShipmateUser[]> {
    const today = new Date();
    const mmdd = `-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Firestore doesn't support suffix queries, so we fetch all and filter client-side.
    // For 20 users this is perfectly fine and free.
    const all = await userService.getAllUsers();
    return all.filter(u => u.birthday?.endsWith(mmdd) ?? false);
  },

  /** Returns users whose birthday falls within the next `days` calendar days */
  async getUpcomingBirthdays(days: number = 7): Promise<Array<ShipmateUser & { daysUntil: number }>> {
    const all = await userService.getAllUsers();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: Array<ShipmateUser & { daysUntil: number }> = [];

    for (const user of all) {
      if (!user.birthday) continue;
      const [, mm, dd] = user.birthday.split('-').map(Number);
      const thisYear = new Date(today.getFullYear(), mm - 1, dd);
      if (thisYear < today) thisYear.setFullYear(today.getFullYear() + 1);
      const diff = Math.round((thisYear.getTime() - today.getTime()) / 86400000);
      if (diff <= days) result.push({ ...user, daysUntil: diff });
    }

    return result.sort((a, b) => a.daysUntil - b.daysUntil);
  },

  async searchUsers(term: string): Promise<ShipmateUser[]> {
    const all = await userService.getAllUsers();
    const lower = term.toLowerCase();
    return all.filter(u =>
      u.name.toLowerCase().includes(lower) ||
      u.email.toLowerCase().includes(lower) ||
      u.department.includes(lower)
    );
  },
};
