export interface ShipmateUser {
  uid: string;
  email: string;
  name: string;
  photoURL?: string;
  department: 'operations' | 'finance' | 'hr' | 'logistics' | 'customer_success' | 'engineering' | 'sales' | 'marketing';
  role: 'employee' | 'manager' | 'hr_admin' | 'super_admin';
  joinedAt: Date;
  lastActiveAt?: Date;
  isActive: boolean;
}

export interface Leave {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  type: 'casual' | 'medical' | 'earned' | 'maternity' | 'paternity' | 'unpaid';
  startDate: Date;
  endDate: Date;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatChannel {
  id: string;
  name: string;
  description?: string;
  type: 'direct' | 'team' | 'general' | 'project';
  members: string[];
  createdBy: string;
  createdAt: Date;
  lastMessageAt?: Date;
  unreadCount?: number;
  archived: boolean;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  content: string;
  mentions: string[];
  attachments: Attachment[];
  reactions: Record<string, string[]>;
  createdAt: Date;
  updatedAt?: Date;
  deletedAt?: Date;
  isEdited: boolean;
  repliesCount: number;
  lastReplyAt?: Date;
}

export interface Attachment {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedAt: Date;
}

export interface LeaveBalance {
  userId: string;
  year: number;
  casual: { allocated: number; used: number; pending: number; available: number };
  medical: { allocated: number; used: number; pending: number; available: number };
  earned: { allocated: number; used: number; pending: number; available: number };
  updatedAt: Date;
}

export interface Holiday {
  id: string;
  date: Date;
  name: string;
  description?: string;
  isOptional: boolean;
  createdAt: Date;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author: string;
  authorName: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  expiresAt?: Date;
  viewedBy: string[];
}

export interface DashboardStats {
  totalEmployees: number;
  onLeaveToday: number;
  pendingApprovals: number;
  upcomingBirthdays: Array<{ name: string; date: Date }>;
}
