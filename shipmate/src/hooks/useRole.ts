'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * Convenience hook for role-based access control throughout the app.
 * All checks are derived from the authenticated user's role — never hard-coded.
 */
export function useRole() {
  const { currentUser } = useAuth();
  const role = currentUser?.role ?? 'employee';
  const dept = currentUser?.department;

  return {
    role,
    department: dept,

    // Role checks
    isAdmin:           role === 'super_admin',
    isHRAdmin:         role === 'hr_admin',
    isManager:         role === 'manager',
    isEmployee:        role === 'employee',
    isHRorAdmin:       role === 'super_admin' || role === 'hr_admin',
    isManagerOrAbove:  ['super_admin', 'hr_admin', 'manager'].includes(role),

    // Feature gates
    can: {
      approveLeaves:      ['super_admin', 'hr_admin', 'manager'].includes(role),
      postAnnouncements:  ['super_admin', 'hr_admin', 'manager'].includes(role),
      manageUsers:        ['super_admin', 'hr_admin'].includes(role),
      viewAllLeaves:      ['super_admin', 'hr_admin'].includes(role),
      manageHolidays:     ['super_admin', 'hr_admin'].includes(role),
      manageLeaveBalance: ['super_admin', 'hr_admin'].includes(role),
      viewFinanceDocs:    ['super_admin', 'hr_admin'].includes(role) || dept === 'finance',
      viewHRDocs:         ['super_admin', 'hr_admin'].includes(role),
      deleteAnyMessage:   ['super_admin', 'hr_admin'].includes(role),
      viewAuditLogs:      role === 'super_admin',
      pinAnnouncements:   ['super_admin', 'hr_admin'].includes(role),
      createChannels:     ['super_admin', 'hr_admin', 'manager'].includes(role),
    },
  };
}

export type UseRoleReturn = ReturnType<typeof useRole>;
