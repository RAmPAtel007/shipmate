import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc,
  query, where, orderBy, serverTimestamp, type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { LeaveRequest, LeaveBalance, Holiday, LeaveStatus, LeaveType } from '@/lib/types';

const LEAVES = 'leaveRequests';
const BALANCES = 'leaveBalances';
const HOLIDAYS = 'leaveHolidays';

function mapLeave(id: string, data: DocumentData): LeaveRequest {
  return { id, ...data } as LeaveRequest;
}

export const leaveService = {

  // ── Apply ───────────────────────────────────────────────────────────────────

  async applyLeave(
    data: Omit<LeaveRequest, 'id' | 'createdAt' | 'status' | 'decidedAt'>
  ): Promise<string> {
    const ref = await addDoc(collection(db, LEAVES), {
      ...data,
      status: 'pending' as LeaveStatus,
      createdAt: serverTimestamp(),
    });
    return ref.id;
  },

  // ── Cancel (employee own pending leave) ────────────────────────────────────

  async cancelLeave(requestId: string): Promise<void> {
    await updateDoc(doc(db, LEAVES, requestId), {
      status: 'cancelled' as LeaveStatus,
      decidedAt: serverTimestamp(),
    });
  },

  // ── Approve / Reject (HR Admin or Manager) ─────────────────────────────────

  async approveLeave(requestId: string, approverId: string, approverName: string): Promise<void> {
    await updateDoc(doc(db, LEAVES, requestId), {
      status: 'approved' as LeaveStatus,
      approverId,
      approverName,
      decidedAt: serverTimestamp(),
    });
  },

  async rejectLeave(
    requestId: string,
    approverId: string,
    approverName: string,
    comment: string
  ): Promise<void> {
    await updateDoc(doc(db, LEAVES, requestId), {
      status: 'rejected' as LeaveStatus,
      approverId,
      approverName,
      managerComment: comment,
      decidedAt: serverTimestamp(),
    });
  },

  // ── Queries ─────────────────────────────────────────────────────────────────

  async getMyLeaves(userId: string): Promise<LeaveRequest[]> {
    const q = query(
      collection(db, LEAVES),
      where('employeeId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapLeave(d.id, d.data()));
  },

  async getPendingLeaves(): Promise<LeaveRequest[]> {
    const q = query(
      collection(db, LEAVES),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'asc') // oldest first for HR queue
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapLeave(d.id, d.data()));
  },

  async getLeavesForCalendar(year: number, month: number): Promise<LeaveRequest[]> {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr   = `${year}-${String(month).padStart(2, '0')}-31`;
    const q = query(
      collection(db, LEAVES),
      where('startDate', '>=', startStr),
      where('startDate', '<=', endStr),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapLeave(d.id, d.data()));
  },

  async getApprovedLeavesOnDate(dateStr: string): Promise<LeaveRequest[]> {
    const q = query(
      collection(db, LEAVES),
      where('startDate', '<=', dateStr),
      where('endDate', '>=', dateStr),
      where('status', '==', 'approved')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => mapLeave(d.id, d.data()));
  },

  // ── Leave Balances ──────────────────────────────────────────────────────────

  async getLeaveBalance(userId: string): Promise<LeaveBalance | null> {
    const snap = await getDoc(doc(db, BALANCES, userId));
    if (!snap.exists()) return null;
    return { uid: userId, ...snap.data() } as LeaveBalance;
  },

  async getOrCreateLeaveBalance(userId: string): Promise<LeaveBalance> {
    const existing = await leaveService.getLeaveBalance(userId);
    if (existing) return existing;

    const year = new Date().getFullYear();
    const defaultBalance: Omit<LeaveBalance, 'uid'> = {
      year,
      casual:  { used: 0, total: 12 },
      sick:    { used: 0, total: 12 },
      wfh:     { used: 0, total: 6  },
      unpaid:  { used: 0, total: 0  },
      updatedAt: serverTimestamp() as any,
    };
    await updateDoc(doc(db, BALANCES, userId), defaultBalance).catch(async () => {
      // Document doesn't exist — use setDoc
      const { setDoc } = await import('firebase/firestore');
      await setDoc(doc(db, BALANCES, userId), defaultBalance);
    });
    return { uid: userId, ...defaultBalance } as LeaveBalance;
  },

  // ── Holidays ────────────────────────────────────────────────────────────────

  async getHolidays(year: number): Promise<Holiday[]> {
    const q = query(
      collection(db, HOLIDAYS),
      where('date', '>=', `${year}-01-01`),
      where('date', '<=', `${year}-12-31`),
      orderBy('date')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday));
  },
};
