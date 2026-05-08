// Brand colors
export const COLORS = {
  navy: '#1B2B5E',
  yellow: '#F5C518',
  background: '#F4F5F7',
  white: '#FFFFFF',
};

// User roles
export const USER_ROLES = {
  SUPER_ADMIN: 'super_admin',
  HR_ADMIN: 'hr_admin',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
} as const;

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  hr_admin: 'HR Admin',
  manager: 'Manager',
  employee: 'Employee',
};

// Departments
export const DEPARTMENTS = {
  OPERATIONS: 'operations',
  FINANCE: 'finance',
  HR: 'hr',
  LOGISTICS: 'logistics',
  CUSTOMER_SUCCESS: 'customer_success',
  ENGINEERING: 'engineering',
  SALES: 'sales',
  MARKETING: 'marketing',
} as const;

export const DEPARTMENT_LABELS: Record<string, string> = {
  operations: 'Operations',
  finance: 'Finance',
  hr: 'Human Resources',
  logistics: 'Logistics',
  customer_success: 'Customer Success',
  engineering: 'Engineering',
  sales: 'Sales',
  marketing: 'Marketing',
};

// Leave types
export const LEAVE_TYPES = {
  CASUAL: 'casual',
  MEDICAL: 'medical',
  EARNED: 'earned',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  UNPAID: 'unpaid',
} as const;

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual Leave',
  medical: 'Medical Leave',
  earned: 'Earned Leave',
  maternity: 'Maternity Leave',
  paternity: 'Paternity Leave',
  unpaid: 'Unpaid Leave',
};

// Leave statuses
export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
} as const;

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

// Default leave allocations per year
export const DEFAULT_LEAVE_ALLOCATIONS = {
  casual: 12,
  medical: 10,
  earned: 20,
  maternity: 180,
  paternity: 15,
  unpaid: 999, // Unlimited
} as const;

// Chat channel types
export const CHANNEL_TYPES = {
  DIRECT: 'direct',
  TEAM: 'team',
  GENERAL: 'general',
  PROJECT: 'project',
} as const;

// API endpoints
export const API_ENDPOINTS = {
  USERS: '/api/users',
  LEAVES: '/api/leaves',
  CHAT: '/api/chat',
  ANNOUNCEMENTS: '/api/announcements',
} as const;

// Firestore collection names
export const FIRESTORE_COLLECTIONS = {
  USERS: 'users',
  LEAVES: 'leaves',
  LEAVE_BALANCES: 'leave_balances',
  CHAT_CHANNELS: 'chat_channels',
  CHAT_MESSAGES: 'chat_messages',
  ANNOUNCEMENTS: 'announcements',
  HOLIDAYS: 'holidays',
  AUDIT_LOGS: 'audit_logs',
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

// Session timeouts (in milliseconds)
export const TIMEOUTS = {
  INACTIVITY: 30 * 60 * 1000, // 30 minutes
  SESSION: 24 * 60 * 60 * 1000, // 24 hours
} as const;

// Date formats
export const DATE_FORMATS = {
  SHORT: 'MMM dd, yyyy',
  LONG: 'MMMM dd, yyyy',
  FULL: 'EEEE, MMMM dd, yyyy',
  TIME: 'hh:mm a',
  DATETIME: 'MMM dd, yyyy hh:mm a',
} as const;

// Validation rules
export const VALIDATION = {
  EMAIL_REGEX: /^[a-zA-Z0-9._%+-]+@shipcube\.com$/,
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REGEX: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  NAME_REGEX: /^[a-zA-Z\s'-]{2,50}$/,
} as const;

// API response messages
export const MESSAGES = {
  SUCCESS: {
    LEAVE_APPLIED: 'Leave application submitted successfully',
    LEAVE_APPROVED: 'Leave approved successfully',
    LEAVE_REJECTED: 'Leave rejected successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    MESSAGE_SENT: 'Message sent successfully',
  },
  ERROR: {
    INVALID_DOMAIN: 'Only @shipcube.com accounts are authorized',
    INVALID_EMAIL: 'Please enter a valid email address',
    INSUFFICIENT_BALANCE: 'Insufficient leave balance',
    PAST_DATE: 'Cannot apply leave for past dates',
    OVERLAP: 'Leave dates overlap with existing leave',
    UNAUTHORIZED: 'You do not have permission to perform this action',
    NETWORK_ERROR: 'Network error. Please try again.',
    SERVER_ERROR: 'Server error. Please try again later.',
  },
} as const;

// Navigation items
export const NAV_ITEMS = [
  { icon: 'Home', label: 'Dashboard', href: '/home', key: 'home' },
  { icon: 'MessageSquare', label: 'Chat', href: '/chat', key: 'chat' },
  { icon: 'Calendar', label: 'Leaves', href: '/leaves', key: 'leaves' },
  { icon: 'Users', label: 'People', href: '/people', key: 'people' },
  { icon: 'FolderOpen', label: 'Documents', href: '/documents', key: 'documents' },
] as const;

// Feature flags
export const FEATURES = {
  ENABLE_CHAT: true,
  ENABLE_ANNOUNCEMENTS: true,
  ENABLE_ANALYTICS: true,
  ENABLE_EXPORT: true,
  ENABLE_API: false,
} as const;
