import { format, formatDistanceToNow, isToday, isYesterday, isTomorrow, differenceInDays } from 'date-fns';
import type { Timestamp } from 'firebase/firestore';
import type { UserRole, Department, LeaveType, LeaveStatus } from '@/lib/types';

// Convert any date-like value to a JS Date
export function toDate(value: Date | Timestamp | string | number | null | undefined): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  if ('toDate' in value) return value.toDate();
  return new Date();
}

export function formatDate(value: Date | Timestamp | string): string {
  return format(toDate(value), 'MMM d, yyyy');
}

export function formatShortDate(value: Date | Timestamp | string): string {
  return format(toDate(value), 'MMM d');
}

export function formatTime(value: Date | Timestamp | string): string {
  return format(toDate(value), 'h:mm a');
}

export function formatDateTime(value: Date | Timestamp | string): string {
  return format(toDate(value), 'MMM d, yyyy h:mm a');
}

/** For message timestamps: shows time if today, short date otherwise */
export function formatMessageTime(value: Date | Timestamp | string): string {
  const date = toDate(value);
  if (isToday(date)) return format(date, 'h:mm a');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

/** For chat date dividers: "Today", "Yesterday", or "May 5, 2026" */
export function formatDateDivider(value: Date | Timestamp | string): string {
  const date = toDate(value);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMMM d, yyyy');
}

/** e.g. "2 hours ago", "just now" */
export function formatRelativeTime(value: Date | Timestamp | string): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true });
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0].toUpperCase())
    .join('');
}

export function getDepartmentLabel(dept: Department): string {
  const labels: Record<Department, string> = {
    'ai-team': 'AI Team',
    'marketing': 'Marketing',
    'finance': 'Finance',
    'hr': 'HR',
  };
  return labels[dept] ?? dept;
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    'super_admin': 'Super Admin',
    'hr_admin': 'HR Admin',
    'manager': 'Manager',
    'employee': 'Employee',
  };
  return labels[role] ?? role;
}

export function getLeaveTypeLabel(type: LeaveType): string {
  const labels: Record<LeaveType, string> = {
    'casual': 'Casual Leave',
    'sick': 'Sick Leave',
    'unpaid': 'Unpaid Leave',
    'half-day-first': 'Half Day — First Half',
    'half-day-second': 'Half Day — Second Half',
    'wfh': 'Work From Home',
  };
  return labels[type] ?? type;
}

export function getLeaveStatusLabel(status: LeaveStatus): string {
  const labels: Record<LeaveStatus, string> = {
    'pending': 'Pending',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'cancelled': 'Cancelled',
  };
  return labels[status] ?? status;
}

/** Stable color from name string, used for avatar backgrounds */
export function getAvatarColor(name: string): string {
  const colors = [
    '#1B2B5E', '#2D4080', '#1a6b3a', '#7c3aed',
    '#b45309', '#0891b2', '#be185d', '#6b7280',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trimEnd() + '…';
}

/** Long text threshold for chat messages — stored in Firebase Storage.
 *  Set very high so normal messages are never flagged; only truly massive
 *  pastes (>100 k chars) fall back to Storage to stay under Firestore's 1 MB doc limit. */
export const LONG_TEXT_THRESHOLD = 100_000;

export function isLongText(text: string): boolean {
  return text.length > LONG_TEXT_THRESHOLD;
}

/** Rough code detection for "Format as code block?" suggestion */
export function looksLikeCode(text: string): boolean {
  const codePatterns = [
    /^(import|export|const|let|var|function|class|interface|type)\s/m,
    /^def |^class |^import |^from /m,
    /^\s*(\/\/|#|\/\*|\* )/m,
    /[{}();]\s*$/m,
    /=>/,
  ];
  return codePatterns.some(p => p.test(text));
}

/** Birthday countdown string */
export function birthdayCountdown(birthdayMMDD: string): string {
  const [month, day] = birthdayMMDD.split('-').map(Number);
  // Normalize both dates to midnight so differenceInDays is exact
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  const diff = differenceInDays(next, today);
  if (diff === 0) return '🎂 Today!';
  if (diff === 1) return '🎉 Tomorrow';
  return `In ${diff} days`;
}

/** Format birthday for display (month + day only, no year) */
export function formatBirthdayDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T00:00:00');
    return format(date, 'MMMM d');
  } catch {
    return dateStr;
  }
}
