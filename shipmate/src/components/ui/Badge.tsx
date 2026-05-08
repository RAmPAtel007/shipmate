import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

type BadgeVariant = 'navy' | 'yellow' | 'success' | 'warning' | 'error' | 'neutral' | 'purple' | 'blue';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  variant?: BadgeVariant;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}

const variantClasses: Record<BadgeVariant, string> = {
  navy:    'bg-[#1B2B5E]/10 text-[#1B2B5E]',
  yellow:  'bg-[#F5C518]/20 text-[#8a6e00]',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  error:   'bg-red-100 text-red-600',
  neutral: 'bg-gray-100 text-gray-600',
  purple:  'bg-purple-100 text-purple-700',
  blue:    'bg-blue-100 text-blue-700',
};

const dotColors: Record<BadgeVariant, string> = {
  navy:    'bg-[#1B2B5E]',
  yellow:  'bg-[#F5C518]',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error:   'bg-red-500',
  neutral: 'bg-gray-400',
  purple:  'bg-purple-500',
  blue:    'bg-blue-500',
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 gap-1',
  md: 'text-xs px-2 py-0.5 gap-1.5',
};

export function Badge({ variant = 'neutral', size = 'md', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full leading-none',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  );
}

// ── Convenience: leave status badge ──────────────────────────────────────────

type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

const leaveStatusMap: Record<LeaveStatus, BadgeVariant> = {
  pending:   'warning',
  approved:  'success',
  rejected:  'error',
  cancelled: 'neutral',
};

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  return (
    <Badge variant={leaveStatusMap[status]} dot>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

// ── Convenience: role badge ───────────────────────────────────────────────────

import type { UserRole } from '@/lib/types';
import { getRoleLabel } from '@/lib/utils/formatters';

const roleVariantMap: Record<UserRole, BadgeVariant> = {
  super_admin: 'navy',
  hr_admin:    'purple',
  manager:     'blue',
  employee:    'neutral',
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge variant={roleVariantMap[role]}>{getRoleLabel(role)}</Badge>;
}
