import { Timestamp } from 'firebase/firestore';

// ─── ENUMS & LITERALS ─────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'hr_admin' | 'manager' | 'employee';
export type Department = 'ai-team' | 'marketing' | 'finance' | 'hr';
export type UserStatus = 'active' | 'inactive';

export type ChannelType = 'public' | 'department' | 'dm' | 'group';

export type LeaveType =
  | 'casual'
  | 'sick'
  | 'unpaid'
  | 'half-day-first'
  | 'half-day-second'
  | 'wfh';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type AllowedFileType = 'pdf' | 'docx' | 'xlsx' | 'png' | 'jpg' | 'jpeg' | 'txt' | 'zip';
export type DocumentFolder = 'general' | 'ai-team' | 'marketing' | 'finance' | 'hr' | 'leave-documents';

export type NotificationPreference = 'all' | 'mentions' | 'muted' | 'dnd';

export type MessageType = 'text' | 'image' | 'file' | 'code' | 'system';

export type AuditAction =
  | 'leave_approved'
  | 'leave_rejected'
  | 'leave_applied'
  | 'leave_cancelled'
  | 'user_created'
  | 'user_updated'
  | 'user_deactivated'
  | 'role_changed'
  | 'document_uploaded'
  | 'document_deleted'
  | 'announcement_posted'
  | 'channel_created'
  | 'leave_balance_updated';

// ─── USER ─────────────────────────────────────────────────────────────────────

/**
 * Keys of optional tabs that an admin can grant to an employee.
 * Default tabs (always visible): home, attendance, calendar, leaves, settings.
 * Everything else requires explicit permission stored here.
 */
export type TabKey = 'chat' | 'payslip' | 'people' | 'documents';

export interface ShipmateUser {
  uid: string;
  name: string;
  email: string;
  department: Department;
  role: UserRole;
  managerId?: string;
  managerName?: string;
  birthday?: string;       // 'YYYY-MM-DD' — month/day shown to all, year only to HR/Admin
  joiningDate?: string;    // 'YYYY-MM-DD'
  phone?: string;
  photoURL?: string | null;
  status: UserStatus;
  notificationTokens: string[]; // FCM tokens (multiple devices)
  /**
   * Tab-level access control.
   * Keys are TabKey values; true = visible in nav, false/missing = hidden.
   * Admins & HR see all tabs regardless of this field.
   */
  tabAccess?: Partial<Record<TabKey, boolean>>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface UserPresence {
  uid: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Timestamp;
  currentChannelId?: string;
  updatedAt: Timestamp;
}

// ─── CHANNELS & MESSAGES ──────────────────────────────────────────────────────

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  departmentId?: Department;
  description?: string;
  members: string[];            // array of uids; for public channels this is everyone
  participantNames?: Record<string, string>; // uid → name (for DMs)
  createdBy: string;            // uid
  isArchived: boolean;
  lastMessageAt?: Timestamp;
  lastMessagePreview?: string;  // truncated to 80 chars
  lastMessageSenderId?: string;
  createdAt: Timestamp;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  size: number;           // bytes
  type: string;           // MIME type
  thumbnailUrl?: string;  // for images
}

export interface MessageReaction {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string | null;
  text: string;                         // full text if short; preview if isLongText
  textPreview?: string;                 // first 300 chars when isLongText = true
  fullTextStoragePath?: string;         // Storage path (long-messages/{channelId}/{id}/content.md)
  isLongText: boolean;
  messageType: MessageType;
  attachments: MessageAttachment[];
  mentions: string[];                   // array of mentioned uids
  reactions: Record<string, MessageReaction>; // emoji string → reaction object
  replyTo?: string;                     // messageId being replied to
  replyToPreview?: string;              // first 100 chars of replied message
  replyToSenderName?: string;
  isEdited: boolean;
  editedAt?: Timestamp;
  isDeleted: boolean;
  deletedAt?: Timestamp;
  createdAt: Timestamp;
}

// ─── LEAVE ────────────────────────────────────────────────────────────────────

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePhotoURL?: string | null;
  departmentId: Department;
  approverId?: string;
  approverName?: string;
  type: LeaveType;
  startDate: string;      // 'YYYY-MM-DD'
  endDate: string;        // 'YYYY-MM-DD' (same as startDate for single/half-day)
  durationDays: number;   // 0.5 for half-day, 1+ for full days
  reason: string;
  status: LeaveStatus;
  managerComment?: string;
  adminMessage?: string;   // message from admin on approve or reject
  createdAt: Timestamp;
  decidedAt?: Timestamp;
}

export interface LeaveBalance {
  uid: string;
  year: number;
  casual: { used: number; total: number };
  sick: { used: number; total: number };
  wfh: { used: number; total: number };
  unpaid: { used: number; total: number };
  updatedAt: Timestamp;
}

export interface Holiday {
  id: string;
  name: string;
  date: string;           // 'YYYY-MM-DD'
  type: 'national' | 'optional';
  createdAt: Timestamp;
}

// ─── ANNOUNCEMENTS ────────────────────────────────────────────────────────────

export interface Announcement {
  id: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  authorPhotoURL?: string | null;
  isPinned: boolean;
  targetDepartments?: string[];
  readBy: string[];     // array of uids
  readCount?: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AnnouncementRead {
  userId: string;
  announcementId: string;
  readAt: Timestamp;
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────

export interface ShipmateDocument {
  id: string;
  name: string;
  originalName: string;
  size: number;           // bytes
  fileType: string;       // MIME type
  folder: DocumentFolder;
  subfolderId?: string;   // ID from document_folders collection
  linkedUserId?: string;  // uid of the employee this doc belongs to
  storagePath: string;
  downloadURL: string;
  uploadedBy: string;     // uid
  uploaderName: string;
  departmentId?: Department;
  description?: string;
  createdAt: Timestamp;
}

// ─── NOTIFICATIONS ────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  uid: string;
  channelPreferences: Record<string, NotificationPreference>; // channelId → preference
  globalDND: boolean;
  dndUntil?: Timestamp;
  updatedAt: Timestamp;
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  action: AuditAction;
  entityType: 'leave' | 'user' | 'document' | 'announcement' | 'channel' | 'system';
  entityId: string;
  actorId: string;
  actorName: string;
  details: Record<string, unknown>;
  createdAt: Timestamp;
}

// ─── DEPARTMENT CONFIG ────────────────────────────────────────────────────────

export interface DepartmentConfig {
  id: Department;
  name: string;
  slug: Department;
  managerId?: string;
  channelId?: string;
  memberCount: number;
  createdAt: Timestamp;
}

// ─── BIRTHDAY ─────────────────────────────────────────────────────────────────

export interface BirthdayWish {
  id: string;
  userId: string;
  year: number;
  message: string;
  postedToChannel: boolean;
  channelMessageId?: string;
  createdAt: Timestamp;
}

// ─── UI / APP STATE ───────────────────────────────────────────────────────────

export interface ChatState {
  activeChannelId: string | null;
  channels: Channel[];
  messages: Record<string, Message[]>; // channelId → messages
  unreadCounts: Record<string, number>; // channelId → unread count
  loadingMessages: boolean;
  sendingMessage: boolean;
}

export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
}