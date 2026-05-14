'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const { permission, requestPermission } = usePushNotifications(currentUser?.uid);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.replace('/login');
      return;
    }
    // Admins belong in the admin panel — redirect them away from the main app
    if (!loading && currentUser && ['super_admin', 'hr_admin'].includes(currentUser.role)) {
      router.replace('/admin');
    }
  }, [currentUser, loading, router]);

  // Full-screen loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F5F7] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-[3px] border-[#1B2B5E]/20 border-t-[#1B2B5E] rounded-full animate-spin" />
          <p className="text-sm text-gray-400 font-medium">Loading SHIPMATE…</p>
        </div>
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <AppShell
      currentUser={currentUser}
      notifPermission={permission}
      onRequestNotifPermission={requestPermission}
    >
      {children}
    </AppShell>
  );
}
