'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function RootPage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(currentUser ? '/home' : '/login');
    }
  }, [currentUser, loading, router]);

  return (
    <div className="min-h-screen bg-[#1B2B5E] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-14 h-14 bg-[#F5C518] rounded-2xl flex items-center justify-center shadow-lg">
          <span className="text-[#1B2B5E] text-3xl font-bold">S</span>
        </div>
        <div className="w-8 h-8 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
