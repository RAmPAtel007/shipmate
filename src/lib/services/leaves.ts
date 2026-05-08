import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  Timestamp,
  QueryConstraint,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type {
  LeaveRequest,
  LeaveBalance,
  LeaveType,
  LeaveStatus,
  Department,
} from '@/lib/types';

export async function applyLeave(
  employeeId: string,
  employeeName: string,
  employeePhotoURL: string | null | undefined,
  departmentId: Department,
  type: LeaveType,
  startDate: string,
  endDate: string,
  durationDays: number,
  reason: string
): Promise<LeaveRequest> {
  const leaveData = {
    employeeId,
    employeeName,
    employeePhotoURL: employeePhotoURL || null,
    departmentId,
    type,
    startDate,
    endDate,
    durationDays,
    reason,
    status: 'pending' as LeaveStatus,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'leaveRequests'), leaveData);

  return {
    id: docRef.id,
    ...leaveData,
    createdAt: Timestamp.now(),
  } as LeaveRequest;
}

export async function fetchLeaveRequests(
  employeeId?: string,
  departmentId?: Department,
  status?: LeaveStatus
): Promise<LeaveRequest[]> {
  const constraints: QueryConstraint[] = [];

  if (employeeId) {
    constraints.push(where('employeeId', '==', employeeId));
  }

  if (departmentId) {
    constraints.push(where('departmentId', '==', departmentId));
  }

  if (status) {
    constraints.push(where('status', '==', status));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(limit(100));

  const q = query(collection(db, 'leaveRequests'), ...constraints);
  const snapshot = await getDocs(q);

  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as LeaveRequest[];
}

export async function approveLeaveRequest(
  requestId: string,
  approverId: string,
  approverName: string
): Promise<void> {
  await updateDoc(doc(db, 'leaveRequests', requestId), {
    status: 'approved' as LeaveStatus,
    approverId,
    approverName,
    decidedAt: serverTimestamp(),
  });
}

export async function rejectLeaveRequest(
  requestId: string,
  approverId: string,
  approverName: string,
  managerComment: string
): Promise<void> {
  await updateDoc(doc(db, 'leaveRequests', requestId), {
    status: 'rejected' as LeaveStatus,
    approverId,
    approverName,
    managerComment,
    decidedAt: serverTimestamp(),
  });
}

export async function cancelLeaveRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'leaveRequests', requestId), {
    status: 'cancelled' as LeaveStatus,
  });
}

export async function getLeaveBalance(
  uid: string,
  year: number
): Promise<LeaveBalance | null> {
  const q = query(
    collection(db, 'leaveBalances'),
    where('uid', '==', uid),
    where('year', '==', year)
  );

  const snapshot = await getDocs(q);

  if (snapshot.empty) return null;

  return {
    uid,
    year,
    ...snapshot.docs[0].data(),
  } as LeaveBalance;
}

export async function updateLeaveBalance(
  uid: string,
  year: number,
  updates: Partial<LeaveBalance>
): Promise<void> {
  const q = query(
    collection(db, 'leaveBalances'),
    where('uid', '==', uid),
    where('year', '==', year)
  );

  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    await updateDoc(snapshot.docs[0].ref, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } else {
    await addDoc(collection(db, 'leaveBalances'), {
      uid,
      year,
      ...updates,
      updatedAt: serverTimestamp(),
    });
  }
}
