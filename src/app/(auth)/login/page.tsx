'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Eye, EyeOff, Shield, ChevronDown,
  MessageSquare, Calendar, Bell, FolderOpen, Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const FEATURES = [
  { icon: MessageSquare, label: 'Team Chat',          desc: 'Real-time messaging & direct messages' },
  { icon: Calendar,      label: 'Leave Management',   desc: 'Apply, track & approve leave requests' },
  { icon: Bell,          label: 'Announcements',      desc: 'Company-wide broadcasts instantly' },
  { icon: FolderOpen,    label: 'Documents',          desc: 'Shared file storage for every team' },
  { icon: Users,         label: 'People Directory',   desc: 'Your entire team in one place' },
];

export default function LoginPage() {
  const [isLoading, setIsLoading]       = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signInAdmin, currentUser, loading, error } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && currentUser) {
      const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);
      router.replace(isAdmin ? '/admin' : '/home');
    }
  }, [currentUser, loading, router]);

  async function handleGoogleSignIn() {
    setIsLoading(true);
    try { await signIn(); } catch { /* handled by AuthContext */ } finally { setIsLoading(false); }
  }

  async function handleAdminSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setIsLoading(true);
    try {
      await signInAdmin(email.trim(), password);
      router.replace('/admin');
    } catch { /* handled by AuthContext */ } finally { setIsLoading(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D1832] flex items-center justify-center">
        <div className="flex flex-col items-center gap-5">
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-10 brightness-0 invert opacity-90"
          />
          <div className="w-5 h-5 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── LEFT — Brand panel ──────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col flex-1 relative overflow-hidden">

        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2B5E] via-[#0D1832] to-[#060D1F]" />
        {/* Glow orbs */}
        <div className="absolute -top-40 -left-40 w-[700px] h-[700px] bg-[#F5C518]/6 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute -bottom-60 -right-20 w-[600px] h-[600px] bg-[#2D4080]/60 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#F5C518]/3 rounded-full blur-[100px] pointer-events-none" />
        {/* Dot grid */}
        <div
          className="absolute inset-0 opacity-[0.035] pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)', backgroundSize: '28px 28px' }}
        />

        <div className="relative z-10 flex flex-col h-full px-12 py-10">

          {/* Logo */}
          <div className="flex items-center">
            <img
              src="https://www.shipcube.com/img/logo.svg"
              alt="Shipcube"
              className="h-9 brightness-0 invert opacity-90"
            />
          </div>

          {/* Hero copy */}
          <div className="flex-1 flex flex-col justify-center max-w-lg">

            {/* Badge */}
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

            {/* Feature list */}
            <div className="grid grid-cols-1 gap-2.5">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label} className="flex items-center gap-3.5 group">
                  <div className="w-9 h-9 bg-white/6 border border-white/8 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-[#F5C518]/12 group-hover:border-[#F5C518]/20 transition-colors">
                    <Icon size={15} className="text-[#F5C518]/80 group-hover:text-[#F5C518] transition-colors" />
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
              <img
                src="https://www.shipcube.com/img/logo.svg"
                alt="Shipcube"
                className="h-4 brightness-0 invert opacity-20"
              />
              <p className="text-white/20 text-[11px]">© {new Date().getFullYear()} ShipCube LLC</p>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white/25 text-[11px]">All systems operational</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT — Login form ─────────────────────────────────────────── */}
      <div className="flex-1 lg:flex-none lg:w-[460px] flex items-center justify-center
                      bg-white min-h-screen lg:min-h-0 p-6 lg:p-10">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center mb-10">
            <img
              src="https://www.shipcube.com/img/logo.svg"
              alt="Shipcube"
              className="h-8"
            />
          </div>

          {/* Heading */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
            <p className="text-gray-400 text-sm mt-1">Sign in to access your workspace</p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <p className="text-red-600 text-sm leading-snug">{error}</p>
            </div>
          )}

          <div className="space-y-3">

            {/* Google Sign In */}
            <button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 bg-[#1B2B5E] hover:bg-[#243872] active:bg-[#111D3F] text-white font-semibold py-3.5 px-5 rounded-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm hover:shadow-lg hover:shadow-[#1B2B5E]/20 text-[0.9rem]"
            >
              {isLoading && !showAdminForm ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* Domain hint */}
            <p className="text-center text-gray-400 text-xs pt-0.5">
              Only{' '}
              <span className="font-semibold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-md">
                @shipcube.com
              </span>{' '}
              accounts are authorized
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-300 font-medium">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* Admin toggle */}
            <button
              onClick={() => setShowAdminForm(!showAdminForm)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${
                showAdminForm
                  ? 'border-[#1B2B5E]/25 bg-[#1B2B5E]/4'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                  showAdminForm ? 'bg-[#1B2B5E]/10' : 'bg-gray-100'
                }`}>
                  <Shield size={14} className={showAdminForm ? 'text-[#1B2B5E]' : 'text-gray-500'} />
                </div>
                <span className={`text-sm font-semibold transition-colors ${
                  showAdminForm ? 'text-[#1B2B5E]' : 'text-gray-600'
                }`}>
                  Admin Sign In
                </span>
              </div>
              <ChevronDown
                size={15}
                className={`transition-all duration-200 ${
                  showAdminForm ? 'rotate-180 text-[#1B2B5E]' : 'text-gray-400'
                }`}
              />
            </button>

            {/* Admin form */}
            {showAdminForm && (
              <form
                onSubmit={handleAdminSignIn}
                className="space-y-3 bg-gray-50/80 rounded-xl p-4 border border-gray-200 animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="admin@shipcube.com"
                    required
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/12 focus:border-[#1B2B5E] transition-all placeholder:text-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">
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
                      className="w-full px-3.5 py-2.5 pr-10 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/12 focus:border-[#1B2B5E] transition-all placeholder:text-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                    >
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading || !email || !password}
                  className="w-full flex items-center justify-center gap-2 bg-[#1B2B5E] hover:bg-[#243872] text-white font-semibold py-2.5 rounded-lg text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md hover:shadow-[#1B2B5E]/20"
                >
                  {isLoading && showAdminForm ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <Shield size={13} />
                      Access Admin Panel
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="flex flex-col items-center gap-2 mt-10">
            <img
              src="https://www.shipcube.com/img/logo.svg"
              alt="Shipcube"
              className="h-5 opacity-25"
            />
            <p className="text-gray-300 text-xs">
              © {new Date().getFullYear()} ShipCube LLC · All rights reserved
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
