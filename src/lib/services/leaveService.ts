import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, setDoc,
  query, where, orderBy, serverTimestamp, increment, writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { LeaveRequest, LeaveBalance, Holiday, LeaveStatus, LeaveType } from '@/lib/types';

const LEAVES    = 'leaveRequests';
const BALANCES  = 'leaveBalances';
const HOLIDAYS  = 'leaveHolidays';

function mapLeave(id: string, data: DocumentData): LeaveRequest {
  return { id, ...data } as LeaveRequest;
}

/**
 * Maps a leave type to the Firestore balance sub-field that should be incremented.
 * Half-day leaves (0.5 days) deduct from casual.
 */
const LEAVE_BALANCE_FIELD: Partial<Record<LeaveType, string>> = {
  casual:            'casual.used',
  'half-day-first':  'casual.used',
  'half-day-second': 'casual.used',
  sick:              'sick.used',
  wfh:               'wfh.used',
  unpaid:            'unpaid.used',
};

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

  // ── Approve ─────────────────────────────────────────────────────────────────
  // Uses writeBatch so both the status update AND balance deduction are atomic.

  async approveLeave(
    requestId: string,
    approverId: string,
    approverName: string,
    adminMessage?: string
  ): Promise<void> {
    // 1. Read the leave request to get employeeId, type, and duration
    const leaveSnap = await getDoc(doc(db, LEAVES, requestId));
    if (!leaveSnap.exists()) throw new Error('Leave request not found');
    const leave = mapLeave(leaveSnap.id, leaveSnap.data());

    // 2. Ensure the employee has a balance document (creates one if missing)
    await leaveService.getOrCreateLeaveBalance(leave.employeeId);

    // 3. Atomic batch: update leave status + deduct from balance
    const batch = writeBatch(db);

    batch.update(doc(db, LEAVES, requestId), {
      status: 'approved' as LeaveStatus,
      approverId,
      approverName,
      adminMessage: adminMessage?.trim() || '',
      decidedAt: serverTimestamp(),
    });

    const balanceField = LEAVE_BALANCE_FIELD[leave.type];
    if (balanceField) {
      batch.update(doc(db, BALANCES, leave.employeeId), {
        [balanceField]: increment(leave.durationDays ?? 1),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  },

  // ── Reject ──────────────────────────────────────────────────────────────────
  // No balance change — leave was pending (never consumed balance).

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
      adminMessage: comment,
      decidedAt: serverTimestamp(),
    });
  },

  // ── Queries ─────────────────────────────────────────────────────────────────

  /** Employee's own leave history, newest first */
  async getMyLeaves(userId: string): Promise<LeaveRequest[]> {
    // Single-field where only — no composite index needed. Sort client-side.
    const q = query(
      collection(db, LEAVES),
      where('employeeId', '==', userId)
    );
    const snap = await getDocs(q);
    const leaves = snap.docs.map(d => mapLeave(d.id, d.data()));
    return leaves.sort((a, b) => {
      const ta = (a.createdAt as any)?.toDate?.()?.getTime() ?? 0;
      const tb = (b.createdAt as any)?.toDate?.()?.getTime() ?? 0;
      return tb - ta; // newest first
    });
  },

  /** All pending leaves, oldest first (HR queue) */
  async getPendingLeaves(): Promise<LeaveRequest[]> {
    const q = query(
      collection(db, LEAVES),
      where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    const leaves = snap.docs.map(d => mapLeave(d.id, d.data()));
    return leaves.sort((a, b) => {
      const ta = (a.createdAt as any)?.toDate?.()?.getTime() ?? 0;
      const tb = (b.createdAt as any)?.toDate?.()?.getTime() ?? 0;
      return ta - tb; // oldest first
    });
  },

  /** Approved leaves that overlap a given calendar month */
  async getLeavesForCalendar(year: number, month: number): Promise<LeaveRequest[]> {
    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr   = `${year}-${String(month).padStart(2, '0')}-31`;
    // Single-field range only to avoid composite index requirement.
    // Filter status client-side.
    const q = query(
      collection(db, LEAVES),
      where('startDate', '>=', startStr),
      where('startDate', '<=', endStr),
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => mapLeave(d.id, d.data()))
      .filter(l => l.status === 'approved');
  },

  /** All approved leaves active on a specific date (YYYY-MM-DD) */
  async getApprovedLeavesOnDate(dateStr: string): Promise<LeaveRequest[]> {
    // Single-field range query so no composite index needed.
    // Filter endDate and status client-side.
    const q = query(
      collection(db, LEAVES),
      where('startDate', '<=', dateStr),
      orderBy('startDate', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs
      .map(d => mapLeave(d.id, d.data()))
      .filter(leave =>
        leave.status === 'approved' &&
        leave.endDate >= dateStr
      );
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
    await setDoc(doc(db, BALANCES, userId), defaultBalance);
    return { uid: userId, ...defaultBalance } as LeaveBalance;
  },

  // ── Holidays ────────────────────────────────────────────────────────────────

  async getHolidays(year: number): Promise<Holiday[]> {
    const q = query(
      collection(db, HOLIDAYS),
      where('date', '>=', `${year}-01-01`),
      where('date', '<=', `${year}-12-31`)
    );
    const snap = await getDocs(q);
    const holidays = snap.docs.map(d => ({ id: d.id, ...d.data() } as Holiday));
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
  },
};
