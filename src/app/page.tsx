'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MessageCircle,
  Clock,
  Calendar,
  DollarSign,
  Megaphone,
  FolderOpen,
  Users,
  CalendarDays,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// ── Static data ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: MessageCircle,
    label: 'Team Chat',
    desc: 'Real-time messaging, channels, and direct messages with emoji reactions.',
    gradient: 'from-blue-500/20 to-blue-600/10',
    border: 'border-blue-500/20',
    iconColor: 'text-blue-400',
  },
  {
    icon: Clock,
    label: 'Attendance',
    desc: 'Punch in/out, live tracking, and admin attendance reports.',
    gradient: 'from-emerald-500/20 to-emerald-600/10',
    border: 'border-emerald-500/20',
    iconColor: 'text-emerald-400',
  },
  {
    icon: Calendar,
    label: 'Leave Management',
    desc: 'Apply, track, and approve leave requests with full history.',
    gradient: 'from-violet-500/20 to-violet-600/10',
    border: 'border-violet-500/20',
    iconColor: 'text-violet-400',
  },
  {
    icon: DollarSign,
    label: 'Payroll & Payslips',
    desc: 'Payroll history, digital payslips, and salary breakdowns.',
    gradient: 'from-yellow-500/20 to-yellow-600/10',
    border: 'border-yellow-500/20',
    iconColor: 'text-yellow-400',
  },
  {
    icon: Megaphone,
    label: 'Announcements',
    desc: 'Company-wide push notifications with read receipts.',
    gradient: 'from-orange-500/20 to-orange-600/10',
    border: 'border-orange-500/20',
    iconColor: 'text-orange-400',
  },
  {
    icon: FolderOpen,
    label: 'Documents',
    desc: 'Secure shared file storage with category-based organisation.',
    gradient: 'from-sky-500/20 to-sky-600/10',
    border: 'border-sky-500/20',
    iconColor: 'text-sky-400',
  },
  {
    icon: Users,
    label: 'People Directory',
    desc: 'Your whole team in one place — search, filter by department.',
    gradient: 'from-pink-500/20 to-pink-600/10',
    border: 'border-pink-500/20',
    iconColor: 'text-pink-400',
  },
  {
    icon: CalendarDays,
    label: 'Holidays',
    desc: 'Company and regional holidays with automatic employee notifications.',
    gradient: 'from-teal-500/20 to-teal-600/10',
    border: 'border-teal-500/20',
    iconColor: 'text-teal-400',
  },
] as const;

const STATS = [
  { value: '8+', label: 'Modules' },
  { value: '100%', label: 'Cloud-based' },
  { value: 'Live', label: 'Real-time sync' },
  { value: 'PWA', label: 'Mobile ready' },
] as const;

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  // Redirect authenticated users straight to their dashboard
  useEffect(() => {
    if (!loading && currentUser) {
      const isAdmin = ['super_admin', 'hr_admin'].includes(currentUser.role);
      router.replace(isAdmin ? '/admin' : '/home');
    }
  }, [currentUser, loading, router]);

  // Minimal loading screen while Firebase resolves auth state
  if (loading) {
    return (
      <div className="min-h-screen bg-[#060D1F] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-8 brightness-0 invert opacity-80"
          />
          <div className="w-5 h-5 border-2 border-[#F5C518] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Prevent flash while redirect fires
  if (currentUser) return null;

  return (
    <div className="min-h-screen bg-[#060D1F] text-white overflow-x-hidden">

      {/* ── Ambient background ────────────────────────────────────────────── */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-48 -left-48 w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] bg-[#F5C518]/5 rounded-full blur-[140px]" />
        <div className="absolute top-1/2 right-0 w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] bg-[#2D4080]/40 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-1/3 w-[400px] h-[300px] bg-[#F5C518]/3 rounded-full blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-5 sm:px-8 lg:px-10 py-4 sm:py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-6 sm:h-7 brightness-0 invert opacity-90"
          />
          <div className="w-px h-4 bg-white/20" />
          <span className="text-white font-black text-sm sm:text-base tracking-tight">
            Shipmate
          </span>
        </div>

        <Link
          href="/login"
          className="flex items-center gap-1.5 bg-[#F5C518] hover:bg-[#e6b800] active:bg-[#d4a800] text-[#060D1F] font-bold text-sm px-4 py-2 rounded-xl transition-all shadow-lg shadow-[#F5C518]/20"
        >
          Sign In <ArrowRight size={14} />
        </Link>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative z-10 text-center px-5 sm:px-8 pt-12 sm:pt-16 pb-16 sm:pb-20 max-w-4xl mx-auto">

        {/* Pill badge */}
        <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 mb-7 sm:mb-8">
          <span className="w-1.5 h-1.5 bg-[#F5C518] rounded-full animate-pulse" />
          <span className="text-[#F5C518] text-[10px] sm:text-[11px] font-bold tracking-[0.15em] uppercase">
            Shipcube Internal Platform
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[2.4rem] leading-[1.08] sm:text-5xl lg:text-7xl font-black tracking-tight mb-5 sm:mb-6">
          Your team,{' '}
          <br className="hidden xs:block" />
          <span className="text-[#F5C518]">all in one place.</span>
        </h1>

        <p className="text-white/45 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-8 sm:mb-10">
          Chat, attendance, leaves, payroll, announcements, documents — everything
          your team needs, unified in a single powerful workspace.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 bg-[#F5C518] hover:bg-[#e6b800] active:bg-[#d4a800] text-[#060D1F] font-bold text-base px-7 py-3.5 rounded-2xl transition-all shadow-xl shadow-[#F5C518]/25 hover:-translate-y-0.5"
          >
            Get Started <ArrowRight size={16} />
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 bg-white/6 hover:bg-white/10 active:bg-white/5 border border-white/10 text-white font-semibold text-base px-7 py-3.5 rounded-2xl transition-all"
          >
            <Shield size={15} className="text-[#F5C518]" />
            Admin Sign In
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-6 sm:gap-10 mt-12 sm:mt-14 pt-8 sm:pt-10 border-t border-white/8">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-xl sm:text-2xl font-black text-[#F5C518]">{value}</p>
              <p className="text-white/40 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="relative z-10 px-5 sm:px-8 lg:px-10 pb-20 sm:pb-24 max-w-7xl mx-auto">
        <div className="text-center mb-10 sm:mb-12">
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mb-3">
            Everything your team needs
          </h2>
          <p className="text-white/40 text-sm sm:text-base max-w-xl mx-auto">
            Eight integrated modules, built to work together seamlessly.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {FEATURES.map(({ icon: Icon, label, desc, gradient, border, iconColor }) => (
            <div
              key={label}
              className={`bg-gradient-to-br ${gradient} border ${border} rounded-2xl p-4 sm:p-5 hover:-translate-y-1 transition-all duration-200 hover:shadow-xl hover:shadow-black/20`}
            >
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-3 sm:mb-4">
                <Icon size={20} className={iconColor} />
              </div>
              <h3 className="text-white font-bold text-sm sm:text-base mb-1.5">{label}</h3>
              <p className="text-white/45 text-xs sm:text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA banner ────────────────────────────────────────────────────── */}
      <section className="relative z-10 px-5 sm:px-8 lg:px-10 pb-16 sm:pb-20 max-w-4xl mx-auto">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1B2B5E] to-[#0D1832] border border-white/8 rounded-2xl sm:rounded-3xl px-6 sm:px-12 py-10 sm:py-12 text-center">
          {/* Glow */}
          <div aria-hidden className="absolute -top-20 -right-20 w-56 h-56 bg-[#F5C518]/8 rounded-full blur-[80px]" />

          <div className="relative">
            <p className="text-[#F5C518] text-[10px] sm:text-xs font-bold tracking-[0.15em] uppercase mb-3">
              Ready to get started?
            </p>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black mb-3 sm:mb-4">
              Sign in to your workspace
            </h2>
            <p className="text-white/40 text-sm sm:text-base mb-7 sm:mb-8">
              Only <span className="text-white/60 font-semibold">@shipcube.com</span> accounts are authorised.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2.5 bg-[#F5C518] hover:bg-[#e6b800] active:bg-[#d4a800] text-[#060D1F] font-bold text-sm sm:text-base px-6 sm:px-8 py-3 sm:py-3.5 rounded-2xl transition-all shadow-xl shadow-[#F5C518]/25"
            >
              Sign In with Google <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 border-t border-white/6 px-5 sm:px-8 lg:px-10 py-5 sm:py-6 max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.shipcube.com/img/logo.svg"
            alt="Shipcube"
            className="h-3.5 brightness-0 invert opacity-25"
          />
          <p className="text-white/20 text-xs">
            © {new Date().getFullYear()} ShipCube LLC · All rights reserved
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-white/25 text-xs">All systems operational</span>
        </div>
      </footer>

    </div>
  );
}
