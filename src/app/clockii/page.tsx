'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Clock,
  MessageSquare,
  Calendar,
  DollarSign,
  Megaphone,
  FolderOpen,
  Users,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Check,
  ChevronDown,
  BarChart3,
} from 'lucide-react';

// ─── Clockii Logo ──────────────────────────────────────────────────────────────
function ClockiiLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Clockii logo"
    >
      <defs>
        <linearGradient id="clk-tile" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2D4080" />
          <stop offset="1" stopColor="#1B2B5E" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#clk-tile)" />
      <rect x="1" y="1" width="38" height="38" rx="10" stroke="#F5C518" strokeOpacity="0.18" />
      <circle cx="20" cy="20" r="10.5" stroke="#F5C518" strokeOpacity="0.4" strokeWidth="1.25" />
      <circle cx="20" cy="11" r="0.9" fill="#F5C518" />
      <circle cx="29" cy="20" r="0.9" fill="#F5C518" opacity="0.55" />
      <circle cx="20" cy="29" r="0.9" fill="#F5C518" opacity="0.55" />
      <circle cx="11" cy="20" r="0.9" fill="#F5C518" opacity="0.55" />
      <path d="M20 20 L16.5 14" stroke="#F5C518" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M20 20 L27 15.5" stroke="#F5C518" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1.7" fill="#F5C518" />
      <circle cx="20" cy="20" r="0.7" fill="#1B2B5E" />
    </svg>
  );
}

// ─── Data ──────────────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Modules', href: '#modules' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ',     href: '#faq' },
] as const;

const MODULES = [
  { icon: Clock,         label: 'Attendance',       desc: 'GPS + selfie punch-in/out, live tracking.' },
  { icon: MessageSquare, label: 'Team Chat',        desc: 'Real-time channels, DMs, file sharing.' },
  { icon: Calendar,      label: 'Leave',            desc: 'Apply, approve, track balances.' },
  { icon: DollarSign,    label: 'Payroll',          desc: 'Payslips, history, Excel export.' },
  { icon: Megaphone,     label: 'Announcements',    desc: 'Company-wide push notifications.' },
  { icon: FolderOpen,    label: 'Documents',        desc: 'Encrypted shared file storage.' },
  { icon: Users,         label: 'People',           desc: 'Searchable employee directory.' },
  { icon: CalendarDays,  label: 'Calendar',         desc: 'Leaves, holidays, birthdays.' },
  { icon: BarChart3,     label: 'Admin Dashboard',  desc: 'Total control in one panel.' },
] as const;

const PRICING_TIERS = [
  {
    name: 'Starter',
    price: '$20',
    desc: 'Small teams getting started.',
    features: ['Up to 25 employees', 'Attendance + GPS', 'Leave & chat', 'Mobile PWA'],
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$30',
    desc: 'Growing companies that need it all.',
    features: ['Up to 250 employees', 'Everything in Starter', 'Payroll + payslips', 'Admin dashboard', 'Priority support'],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    desc: 'Large organisations & custom needs.',
    features: ['Unlimited employees', 'SSO / SAML', 'Custom branding', 'Dedicated CSM'],
    highlight: false,
  },
] as const;

const FAQS = [
  { q: 'How long does setup take?',  a: 'Most teams are up and running in under 30 minutes. No software to install — Clockii is a web app + mobile PWA.' },
  { q: 'Is my data secure?',         a: 'All data is encrypted in transit and at rest. Hosted on Google Cloud. Role-based access. GDPR-compliant.' },
  { q: 'Can I export my data?',      a: 'Yes — payroll exports to .xlsx natively, and attendance/leave history can be exported anytime.' },
  { q: 'Do you offer a free trial?', a: '14 days free, no credit card required. Full access to every feature.' },
] as const;

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function ClockiiLanding() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() { setScrolled(window.scrollY > 12); }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#060D1F] text-white overflow-x-hidden selection:bg-[#F5C518]/30 selection:text-white">

      {/* Ambient background */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-48 -left-32 w-[600px] h-[600px] bg-[#F5C518]/[0.06] rounded-full blur-[160px]" />
        <div className="absolute top-1/3 -right-32 w-[500px] h-[500px] bg-[#2D4080]/40 rounded-full blur-[160px]" />
      </div>

      {/* Nav */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-xl ${
          scrolled
            ? 'bg-[#060D1F]/90 border-b border-white/10 shadow-lg shadow-black/20'
            : 'bg-[#060D1F]/70 border-b border-white/5'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 sm:py-3.5 flex items-center justify-between gap-3 sm:gap-4">
          <Link href="#" className="flex items-center gap-2 sm:gap-3 group flex-shrink min-w-0">
            <ClockiiLogo size={28} className="sm:w-9 sm:h-9 transition-transform group-hover:scale-105 flex-shrink-0" />
            <div className="flex flex-col leading-none min-w-0">
              <span className="text-white font-black text-base sm:text-lg tracking-tight">Clockii</span>
              <span className="hidden xs:inline text-[#F5C518]/70 text-[8px] sm:text-[9px] font-bold tracking-[0.12em] uppercase mt-0.5 truncate">
                Powered by ShipcubeAI
              </span>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-x-10">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="text-white/70 hover:text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {l.label}
              </a>
            ))}
          </div>

          <Link
            href="/login"
            className="flex items-center gap-1.5 bg-[#F5C518] hover:bg-[#e6b800] text-[#060D1F] font-bold text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-xl transition-all shadow-lg shadow-[#F5C518]/20 flex-shrink-0"
          >
            Explore <ArrowRight size={13} className="sm:w-3.5 sm:h-3.5" />
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 pt-28 sm:pt-32 pb-14 sm:pb-20 px-5 sm:px-8 max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-[#F5C518]/10 border border-[#F5C518]/15 rounded-full px-3.5 py-1.5 mb-6">
          <Sparkles size={11} className="text-[#F5C518]" />
          <span className="text-white/80 text-[10px] font-bold tracking-[0.12em] uppercase">
            Public beta · Free for 14 days
          </span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-[1.05] mb-5">
          Your team,<br />
          <span className="bg-gradient-to-r from-[#F5C518] via-[#fde047] to-[#F5C518] bg-clip-text text-transparent">
            on the clock.
          </span>
        </h1>

        <p className="text-white/55 text-base sm:text-lg leading-relaxed max-w-xl mx-auto mb-8">
          Attendance, chat, leave, payroll — one workspace. No spreadsheets, no WhatsApp groups, no email chains.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="w-full sm:w-auto group flex items-center justify-center gap-2 bg-[#F5C518] hover:bg-[#e6b800] text-[#060D1F] font-black text-base px-7 py-3.5 rounded-2xl transition-all shadow-xl shadow-[#F5C518]/25 hover:-translate-y-0.5"
          >
            Explore Clockii
            <ArrowRight size={17} className="group-hover:translate-x-1 transition-transform" />
          </Link>
          <a
            href="#modules"
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-base px-7 py-3.5 rounded-2xl transition-all"
          >
            See modules
          </a>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="relative z-10 py-14 sm:py-20 px-5 sm:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-10">
          <p className="text-[#F5C518]/90 text-[11px] font-bold tracking-[0.18em] uppercase mb-3">
            What's inside
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            9 modules. <span className="text-[#F5C518]">One workspace.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {MODULES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="group flex items-start gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/8 hover:border-[#F5C518]/25 rounded-2xl p-4 transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-[#F5C518]/10 border border-[#F5C518]/15 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F5C518]/15 transition-colors">
                <Icon size={17} className="text-[#F5C518]" />
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm mb-0.5">{label}</p>
                <p className="text-white/50 text-xs leading-snug">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative z-10 py-14 sm:py-20 px-5 sm:px-8 max-w-6xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-10">
          <p className="text-[#F5C518]/90 text-[11px] font-bold tracking-[0.18em] uppercase mb-3">
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            Simple, <span className="text-[#F5C518]">transparent.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
          {PRICING_TIERS.map(tier => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-5 sm:p-6 transition-all ${
                tier.highlight
                  ? 'bg-gradient-to-br from-[#F5C518]/10 to-[#2D4080]/20 border-2 border-[#F5C518]/40'
                  : 'bg-white/[0.04] border border-white/10 hover:border-white/20'
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-4 sm:left-6 bg-[#F5C518] text-[#060D1F] text-[10px] font-black px-3 py-1 rounded-full tracking-widest uppercase">
                  Most popular
                </span>
              )}
              <p className="text-white font-bold text-base mb-1">{tier.name}</p>
              <p className="text-white/50 text-xs mb-4">{tier.desc}</p>
              <p className="text-white font-black text-3xl mb-4">
                {tier.price}
                {tier.price !== 'Custom' && <span className="text-white/40 text-sm font-semibold">/user/mo</span>}
              </p>
              <ul className="space-y-2 mb-5">
                {tier.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-white/70 text-sm">
                    <Check size={14} className="text-[#F5C518] mt-0.5 flex-shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/login"
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  tier.highlight
                    ? 'bg-[#F5C518] hover:bg-[#e6b800] text-[#060D1F]'
                    : 'bg-white/10 hover:bg-white/15 text-white border border-white/10'
                }`}
              >
                {tier.name === 'Enterprise' ? 'Talk to sales' : 'Start free trial'}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 py-14 sm:py-20 px-5 sm:px-8 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <p className="text-[#F5C518]/90 text-[11px] font-bold tracking-[0.18em] uppercase mb-3">FAQ</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Quick answers.</h2>
        </div>

        <div className="space-y-2">
          {FAQS.map((f, i) => (
            <button
              key={f.q}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full text-left bg-white/[0.03] hover:bg-white/[0.06] border border-white/8 rounded-xl px-4 py-3.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-white font-semibold text-sm">{f.q}</p>
                <ChevronDown
                  size={16}
                  className={`text-white/40 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                />
              </div>
              {openFaq === i && (
                <p className="text-white/55 text-sm leading-relaxed mt-3">{f.a}</p>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 py-14 sm:py-20 px-5 sm:px-8 max-w-4xl mx-auto">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1B2B5E] via-[#0D1832] to-[#060D1F] border border-[#F5C518]/20 rounded-3xl px-6 sm:px-10 py-10 sm:py-14 text-center">
          <div aria-hidden className="absolute -top-24 -right-24 w-64 h-64 bg-[#F5C518]/15 rounded-full blur-[100px]" />
          <div aria-hidden className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#2D4080]/40 rounded-full blur-[100px]" />

          <div className="relative">
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight mb-3 leading-tight">
              Ready to run your team{' '}
              <span className="bg-gradient-to-r from-[#F5C518] to-[#fde047] bg-clip-text text-transparent">
                on Clockii?
              </span>
            </h2>
            <p className="text-white/60 text-sm sm:text-base mb-6">
              Free for 14 days · No credit card required.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-[#F5C518] hover:bg-[#e6b800] text-[#060D1F] font-black text-base px-7 py-3.5 rounded-2xl transition-all shadow-xl shadow-[#F5C518]/30 hover:-translate-y-0.5"
            >
              Explore Clockii <ArrowRight size={17} />
            </Link>
            <p className="text-white/40 text-xs mt-5">Powered by ShipcubeAI</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ClockiiLogo size={26} />
            <span className="text-white font-black text-sm tracking-tight">Clockii</span>
            <a
              href="https://www.shipcube.com"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 inline-flex items-center gap-1.5 bg-white/[0.04] border border-[#F5C518]/15 hover:border-[#F5C518]/30 rounded-full px-2.5 py-1 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.shipcube.com/img/logo.svg"
                alt="Shipcube"
                className="h-3 brightness-0 invert opacity-70"
              />
              <span className="text-white/60 text-[9px] font-bold tracking-[0.12em] uppercase">
                Powered by <span className="text-[#F5C518]">ShipcubeAI</span>
              </span>
            </a>
          </div>
          <p className="text-white/30 text-xs">
            © {new Date().getFullYear()} Clockii · All rights reserved
          </p>
        </div>
      </footer>
    </div>
  );
}
