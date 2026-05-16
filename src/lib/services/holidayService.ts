import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, query, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export interface Holiday {
  id?: string;
  name: string;
  date: string;          // YYYY-MM-DD
  regions: string[];     // e.g. ['IN', 'US', 'SG']
  type: 'company' | 'regional';
  createdAt?: any;
  createdBy?: string;
  createdByName?: string;
}

export const holidayService = {

  async getHolidays(): Promise<Holiday[]> {
    const q = query(collection(db, 'holidays'), orderBy('date', 'asc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday));
  },

  async createHoliday(data: Omit<Holiday, 'id' | 'createdAt'>): Promise<string> {
    const ref = await addDoc(collection(db, 'holidays'), {
      ...data,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  async updateHoliday(id: string, data: Partial<Holiday>): Promise<void> {
    const { id: _id, createdAt: _ca, ...rest } = data as any;
    await updateDoc(doc(db, 'holidays', id), rest);
  },

  async deleteHoliday(id: string): Promise<void> {
    await deleteDoc(doc(db, 'holidays', id));
  },
};
