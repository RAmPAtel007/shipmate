'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff,
  MessageSquare, Calendar, Bell, FolderOpen, Users,
  Clock, DollarSign, LogIn, AlertCircle, Mail, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { sendPasswordReset } from '@/lib/firebase/auth';

const FEATURES = [
  { icon: MessageSquare, label: 'Team Chat',          desc: 'Real-time messaging & channels' },
  { icon: Clock,         label: 'Attendance',         desc: 'Punch in/out & live tracking' },
  { icon: Calendar,      label: 'Leave Management',   desc: 'Apply, track & approve requests' },
  { icon: DollarSign,    label: 'Payroll & Payslips', desc: 'Payroll history & digital payslips' },
  { icon: Bell,          label: 'Announcements',      desc: 'Push notifications company-wide' },
  { icon: FolderOpen,    label: 'Documents',          desc: 'Secure shared file storage' },
  { icon: Users,         label: 'People Directory',   desc: 'Your whole team in one place' },
];

export default function LoginPage() {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
  const [showReset, setShowReset]       = useState(false);
  const [resetEmail, setResetEmail]     = useState('');
  const [resetSent, setResetSent]       = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError]     = useState('');
  const { signIn, currentUser, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser) {
      const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);
      router.replace(isAdmin ? '/admin' : '/home');
    }
  }, [currentUser, loading, router]);

  async function handleSendReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setResetLoading(true);
    setResetError('');
    try {
      await sendPasswordReset(resetEmail.trim());
      setResetSent(true);
    } catch (err: any) {
      setResetError(err?.message?.includes('user-not-found')
        ? 'No account found with that email.'
        : 'Failed to send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    try {
      await signIn(email.trim(), password);
      // Redirect is handled by the useEffect above once currentUser updates
    } catch {
      // Error displayed via AuthContext error state
    } finally {
      setIsLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1832] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://www.shipcube.com/img/logo.svg" alt="Shipcube"
            className="h-10 brightness-0 invert opacity-90" />
          <div className="w-5 h-5 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── LEFT — Brand panel ──────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">

        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2B5E] via-[#0D1832] to-[#060D1F]" />
        <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-[#F5C518]/6 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute -bottom-60 -right-20 w-[600px] h-[600px] bg-[#2D4080]/60 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#F5C518]/3 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)', backgroundSize: '28px 28px' }} />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.shipcube.com/img/logo.svg" alt="Shipcube"
              className="h-9 brightness-0 invert opacity-90" />
          </div>

          {/* Hero copy */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">
            <div className="inline-flex items-center gap-2 bg-white/6 border border-white/10 rounded-full px-4 py-1.5 w-fit mb-7">
              <div className="w-1.5 h-1.5 bg-[#F5C518] rounded-full animate-pulse" />
              <span className="text-[#F5C518] text-[11px] font-bold tracking-[0.15em] uppercase">
                Shipcube Internal Platform
              </span>
            </div>

            <h1 className="text-[3.2rem] font-black text-white leading-[1.08] tracking-tight mb-5">
              Your team,<br />
              <span className="text-[#F5C518]">all in one place.</span>
            </h1>

            <p className="text-white/45 text-[1.05rem] leading-relaxed mb-10 max-w-md">
              Chat, leaves, announcements, documents — everything your team needs, unified in a single powerful workspace.
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3 group">
                  <div className="w-8 h-8 bg-white/6 border border-white/8 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-[#F5C518]/12 group-hover:border-[#F5C518]/20 transition-colors">
                    <Icon size={14} className="text-[#F5C518]/80 group-hover:text-[#F5C518] transition-colors" />
                  </div>
                  <div>
                    <p className="text-white/80 text-sm font-semibold leading-tight">{label}</p>
                    <p className="text-white/35 text-xs">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.shipcube.com/img/logo.svg" alt="Shipcube"
                className="h-4 brightness-0 invert opacity-20" />
              <p className="text-white/20 text-[11px]">© {new Date().getFullYear()} ShipCube LLC</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/25 text-[11px]">All systems operational</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Login form ──────────────────────────────────────────────── */}
      <div className="flex-1 lg:flex-none lg:w-[460px] flex items-center justify-center
                      bg-white min-h-screen lg:min-h-0 p-6 lg:p-10">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.shipcube.com/img/logo.svg" alt="Shipcube" className="h-8" />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
            <p className="text-gray-400 text-sm mt-1">Sign in with your Shipcube credentials</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
              <AlertCircle size={15} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-red-600 text-sm leading-snug">{error}</p>
            </div>
          )}

          {/* ── Forgot password panel ── */}
          {showReset && (
            <div className="mb-6 bg-gray-50 border border-gray-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold text-gray-800">Reset your password</p>
                <button type="button" onClick={() => { setShowReset(false); setResetSent(false); setResetError(''); }}
                  className="text-gray-400 hover:text-gray-600">
                  <AlertCircle size={14}/>
                </button>
              </div>

              {resetSent ? (
                <div className="flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5"/>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Check your inbox</p>
                    <p className="text-xs text-gray-500 mt-0.5">A password reset link was sent to <span className="font-semibold">{resetEmail}</span>. Click the link to set your new password.</p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendReset} className="space-y-3">
                  {resetError && (
                    <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{resetError}</p>
                  )}
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="yourname@shipcube.com"
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] placeholder:text-gray-300"
                  />
                  <button type="submit" disabled={resetLoading || !resetEmail}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#2D4080] transition-colors">
                    {resetLoading
                      ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending…</>
                      : <><Mail size={13}/>Send reset link</>
                    }
                  </button>
                  <p className="text-[11px] text-gray-400 text-center leading-snug">
                    Works for existing Google accounts too — you&apos;ll be able to set a password after clicking the link.
                  </p>
                </form>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSignIn} className="space-y-4">

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="yourname@shipcube.com"
                required
                autoComplete="email"
                autoFocus
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] transition-all placeholder:text-gray-300"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-widest">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] transition-all placeholder:text-gray-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end -mt-1">
              <button type="button" onClick={() => { setShowReset(true); setResetEmail(email); setResetSent(false); setResetError(''); }}
                className="text-xs text-[#1B2B5E] hover:underline font-semibold">
                Forgot password?
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="w-full flex items-center justify-center gap-2.5 bg-[#1B2B5E] hover:bg-[#243872] active:bg-[#111D3F] text-white font-semibold py-3.5 rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-lg hover:shadow-[#1B2B5E]/20 text-[0.9rem] mt-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Sign In
                </>
              )}
            </button>

            {/* Domain note */}
            <p className="text-center text-gray-400 text-xs pt-1">
              Access is restricted to{' '}
              <span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                @shipcube.com
              </span>{' '}
              accounts only.{' '}
              <br className="sm:hidden" />
              Contact HR if you need access.
            </p>
          </form>

          {/* Footer */}
          <div className="flex flex-col items-center gap-2 mt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.shipcube.com/img/logo.svg" alt="Shipcube"
              className="h-5 opacity-25" />
            <p className="text-gray-300 text-xs">
              © {new Date().getFullYear()} ShipCube LLC · All rights reserved
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
