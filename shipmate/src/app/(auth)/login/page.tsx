'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const { signIn, currentUser, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser) {
      router.replace('/home');
    }
  }, [currentUser, loading, router]);

  async function handleSignIn() {
    setIsLoading(true);
    try {
      await signIn();
      router.replace('/home');
    } catch {
      // error handled by AuthContext
    } finally {
      setIsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B2B5E] to-[#111D3F] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B2B5E] to-[#111D3F] flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
      />

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-7">
            <div className="w-18 h-18 bg-[#1B2B5E] rounded-2xl flex items-center justify-center shadow-lg"
              style={{ width: 72, height: 72 }}>
              <span className="text-[#F5C518] font-bold" style={{ fontSize: 36 }}>S</span>
            </div>
          </div>

          {/* Branding */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-[#1B2B5E] tracking-tight">SHIPMATE</h1>
            <p className="text-gray-400 mt-1.5 text-sm font-medium tracking-wide uppercase">
              Shipcube Team Operating System
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-red-600 text-sm leading-snug">{error}</p>
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 bg-[#F5C518] hover:bg-[#D4A016] active:bg-[#b8900f] text-[#1B2B5E] font-semibold py-3.5 px-6 rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-md text-base"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-[#1B2B5E]/40 border-t-[#1B2B5E] rounded-full animate-spin" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                {/* Google G logo */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>

          {/* Domain notice */}
          <p className="text-center text-gray-400 text-xs mt-5 leading-relaxed">
            Only <span className="font-semibold text-gray-500">@shipcube.com</span> accounts<br />
            are authorized to access SHIPMATE
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-6">
          © {new Date().getFullYear()} Shipcube &nbsp;·&nbsp; SHIPMATE v1.0
        </p>
      </div>
    </div>
  );
}
