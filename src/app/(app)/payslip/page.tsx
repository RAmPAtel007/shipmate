'use client';

import { useState, useEffect } from 'react';
import {
  DollarSign, ChevronDown, Loader2, TrendingUp,
  ArrowDownRight, IndianRupee, FileText, Receipt, Download,
} from 'lucide-react';
import {
  collection, query, where, onSnapshot, doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

function fmtINR(n: number) { return `₹${Math.round(n).toLocaleString('en-IN')}`; }
function fmtUSD(n: number) { return `$${Math.round(n).toLocaleString('en-US')}`; }

function monthLabel(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function Row({ label, val, vc = 'text-gray-800', sub }: {
  label: string; val: string; vc?: string; sub?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <div>
        <span className="text-xs text-gray-500">{label}</span>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-xs font-bold ${vc}`}>{val}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayslipPage() {
  const { currentUser } = useAuth();
  const [profile, setProfile]         = useState<any>(null);
  const [entries, setEntries]         = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(CURRENT_MONTH);
  const [profLoading, setProfLoading] = useState(true);
  const [entLoading, setEntLoading]   = useState(true);
  const loading = profLoading || entLoading;

  // Payroll profile listener
  useEffect(() => {
    if (!currentUser) return;
    setProfLoading(true);
    const unsub = onSnapshot(
      doc(db, 'payrollProfiles', currentUser.uid),
      snap => { setProfile(snap.exists() ? snap.data() : null); setProfLoading(false); },
      () => setProfLoading(false),
    );
    return () => unsub();
  }, [currentUser]);

  // Payroll entries listener — single-field query, filter month client-side
  useEffect(() => {
    if (!currentUser) return;
    setEntLoading(true);
    const unsub = onSnapshot(
      query(collection(db, 'payrollEntries'), where('uid', '==', currentUser.uid)),
      snap => {
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) => (b.month > a.month ? 1 : -1));
        setEntries(sorted);
        setEntLoading(false);
      },
      () => setEntLoading(false),
    );
    return () => unsub();
  }, [currentUser]);

  const entry = entries.find((e: any) => e.month === selectedMonth) ?? null;
  const isUS = profile?.country === 'US';
  const fmt  = (n: number) => isUS ? fmtUSD(n) : fmtINR(n);

  // ── Payslip calculation ────────────────────────────────────────────────────
  const calc = (() => {
    if (!profile || !entry) return null;

    if (isUS) {
      const base   = profile.baseSalary ?? 0;
      const otPay  = entry.otPay ?? 0;
      const adj    = entry.adjustments ?? 0;
      const lwp    = Math.round(base / 22 * (entry.unpaidLeaveDays ?? 0));
      const gross  = base + otPay + adj;
      const k401   = Math.round(gross * ((profile.k401Pct ?? 0) / 100));
      const health = profile.healthIns ?? 0;
      const totalDed = k401 + health + lwp;
      return { gross, net: gross - totalDed, otPay, adj, lwp, k401, health, totalDed, otHours: entry.otHours ?? 0 };
    } else {
      const basic   = profile.basic ?? 0;
      const hra     = profile.hra ?? 0;
      const special = profile.specialAllowance ?? 0;
      const lta     = Math.round((profile.lta ?? 0) / 12);
      const medical = profile.medical ?? 0;
      const otPay   = entry.otPay ?? 0;
      const adj     = entry.adjustments ?? 0;
      const gross   = basic + hra + special + lta + medical + otPay + adj;
      const pfRate  = profile.pfApplicable ? ((profile.pfRate ?? 12) / 100) : 0;
      const pf      = Math.round(basic * pfRate);
      const esi     = profile.esiApplicable ? Math.round(gross * 0.0075) : 0;
      const lwp     = Math.round(basic / 26 * (entry.unpaidLeaveDays ?? 0));
      const totalDed = pf + esi + lwp;
      return {
        gross, net: gross - totalDed,
        basic, hra, special, lta, medical,
        otPay, adj, pf, pfRate: profile.pfRate ?? 12,
        esi, lwp, totalDed, otHours: entry.otHours ?? 0,
      };
    }
  })();

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#1B2B5E]" />
      </div>
    );
  }

  // ── No profile yet ─────────────────────────────────────────────────────────
  if (!profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          {isUS
            ? <DollarSign size={28} className="text-gray-300" />
            : <IndianRupee size={28} className="text-gray-300" />}
        </div>
        <p className="text-gray-600 font-semibold">No payroll profile set up</p>
        <p className="text-xs text-gray-400 mt-1">Contact HR to set up your salary structure</p>
      </div>
    );
  }

  const statusBadge = entry?.status as string | undefined;
  // Allow download whenever payroll data exists (any status)
  const canDownload = !!calc;

  // ── Generate printable payslip ─────────────────────────────────────────────
  function downloadPayslip() {
    if (!calc || !profile || !entry) return;
    const rows = (pairs: [string, string][]) =>
      pairs.map(([l, v]) => `<tr><td style="padding:7px 0;color:#555;font-size:13px;border-bottom:1px solid #f0f0f0">${l}</td><td style="padding:7px 0;text-align:right;font-weight:600;font-size:13px;border-bottom:1px solid #f0f0f0">${v}</td></tr>`).join('');

    const earningRows = isUS
      ? rows([
          ['Base Salary', fmt(profile.baseSalary)],
          ...(calc.otPay > 0 ? [[`Overtime (${calc.otHours}h)`, fmt(calc.otPay)]] as [string,string][] : []),
          ...(calc.adj !== 0 ? [[`Adjustments`, `${calc.adj >= 0 ? '+' : ''}${fmt(calc.adj)}`]] as [string,string][] : []),
        ])
      : rows([
          ['Basic Salary', fmt((calc as any).basic)],
          ['HRA', fmt((calc as any).hra)],
          ...((calc as any).special > 0 ? [['Special Allowance', fmt((calc as any).special)]] as [string,string][] : []),
          ...((calc as any).lta > 0 ? [['LTA (monthly)', fmt((calc as any).lta)]] as [string,string][] : []),
          ...((calc as any).medical > 0 ? [['Medical Allowance', fmt((calc as any).medical)]] as [string,string][] : []),
          ...(calc.otPay > 0 ? [[`Overtime (${calc.otHours}h)`, fmt(calc.otPay)]] as [string,string][] : []),
          ...(calc.adj !== 0 ? [['Adjustments', `${calc.adj >= 0 ? '+' : ''}${fmt(calc.adj)}`]] as [string,string][] : []),
        ]);

    const dedRows = isUS
      ? rows([
          ...((calc as any).k401 > 0 ? [[`401(k) (${profile.k401Pct}%)`, `-${fmt((calc as any).k401)}`]] as [string,string][] : []),
          ...((calc as any).health > 0 ? [['Health Insurance', `-${fmt((calc as any).health)}`]] as [string,string][] : []),
          ...(calc.lwp > 0 ? [[`LWP (${entry.unpaidLeaveDays}d)`, `-${fmt(calc.lwp)}`]] as [string,string][] : []),
        ])
      : rows([
          ...((calc as any).pf > 0 ? [[`PF Employee (${(calc as any).pfRate}%)`, `-${fmt((calc as any).pf)}`]] as [string,string][] : []),
          ...((calc as any).esi > 0 ? [['ESI (0.75%)', `-${fmt((calc as any).esi)}`]] as [string,string][] : []),
          ...(calc.lwp > 0 ? [[`LWP (${entry.unpaidLeaveDays}d)`, `-${fmt(calc.lwp)}`]] as [string,string][] : []),
        ]);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Payslip – ${monthLabel(selectedMonth)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f5f5f5; }
  .page { max-width:680px; margin:30px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
  .header { background:#1B2B5E; padding:28px 32px; display:flex; justify-content:space-between; align-items:flex-start; }
  .co { color:#fff; font-size:22px; font-weight:900; letter-spacing:-.5px; }
  .co-sub { color:rgba(255,255,255,.4); font-size:10px; margin-top:2px; text-transform:uppercase; letter-spacing:1px; }
  .month-badge { background:rgba(245,197,24,.15); color:#F5C518; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; }
  .net-bar { background:#F5C518; padding:18px 32px; display:flex; justify-content:space-between; align-items:center; }
  .net-label { color:#1B2B5E; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; }
  .net-amount { color:#1B2B5E; font-size:28px; font-weight:900; }
  .body { padding:24px 32px; }
  .emp-row { display:flex; gap:32px; padding-bottom:18px; border-bottom:2px solid #f0f0f0; margin-bottom:18px; }
  .emp-field label { font-size:10px; color:#999; text-transform:uppercase; letter-spacing:.5px; display:block; margin-bottom:3px; }
  .emp-field span { font-size:13px; font-weight:600; color:#222; }
  .section-title { font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.8px; margin:18px 0 6px; }
  .section-title.earn { color:#16a34a; }
  .section-title.ded  { color:#dc2626; }
  table { width:100%; border-collapse:collapse; }
  .total-row td { padding:9px 0; font-size:13px; font-weight:800; border-top:2px solid #e5e5e5; }
  .total-row .earn-total { color:#16a34a; text-align:right; }
  .total-row .ded-total  { color:#dc2626; text-align:right; }
  .net-row { display:flex; justify-content:space-between; align-items:center; margin-top:18px; padding-top:14px; border-top:2px solid #1B2B5E; }
  .net-row-label { font-size:14px; font-weight:800; color:#1B2B5E; }
  .net-row-amount { font-size:22px; font-weight:900; color:#1B2B5E; }
  .status-chip { display:inline-block; padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:${statusBadge === 'Ready' ? '#dcfce7' : statusBadge === 'On Hold' ? '#fee2e2' : '#fef3c7'}; color:${statusBadge === 'Ready' ? '#16a34a' : statusBadge === 'On Hold' ? '#dc2626' : '#d97706'}; }
  .footer { text-align:center; color:#bbb; font-size:10px; padding:14px; border-top:1px solid #f0f0f0; margin-top:16px; }
  @media print { body{background:#fff} .page{box-shadow:none;margin:0;border-radius:0} }
</style></head><body>
<div class="page">
  <div class="header">
    <div>
      <div class="co">Shipmate</div>
      <div class="co-sub">powered by Shipcube Ai</div>
    </div>
    <div class="month-badge">${monthLabel(selectedMonth)}</div>
  </div>
  <div class="net-bar">
    <div>
      <div class="net-label">Net Pay</div>
      <div class="net-amount">${fmt(calc.net)}</div>
    </div>
    <span class="status-chip">${statusBadge ?? 'Pending'}</span>
  </div>
  <div class="body">
    <div class="emp-row">
      <div class="emp-field"><label>Employee</label><span>${currentUser?.name ?? ''}</span></div>
      <div class="emp-field"><label>Month</label><span>${monthLabel(selectedMonth)}</span></div>
      <div class="emp-field"><label>Payroll</label><span>${profile.country === 'US' ? '🇺🇸 US' : '🇮🇳 India'}</span></div>
    </div>

    <div class="section-title earn">Earnings</div>
    <table>${earningRows}
      <tr class="total-row"><td>Total Earnings</td><td class="earn-total">${fmt(calc.gross)}</td></tr>
    </table>

    ${calc.totalDed > 0 ? `
    <div class="section-title ded">Deductions</div>
    <table>${dedRows}
      <tr class="total-row"><td>Total Deductions</td><td class="ded-total">-${fmt(calc.totalDed)}</td></tr>
    </table>` : ''}

    <div class="net-row">
      <span class="net-row-label">Net Pay</span>
      <span class="net-row-amount">${fmt(calc.net)}</span>
    </div>
    <div class="footer">This is a system-generated payslip · Shipmate by Shipcube Ai</div>
  </div>
</div>
<script>window.onload = () => window.print();</script>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url  = URL.createObjectURL(blob);
    // Use a hidden anchor with download attribute — avoids popup blockers
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslip-${selectedMonth}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#1B2B5E] px-6 pt-6 pb-14 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1B2B5E] to-[#2D4080] pointer-events-none" />
        <div className="relative">
          <p className="text-white/50 text-xs font-medium uppercase tracking-wider mb-1">My Payslip</p>
          <h1 className="text-white font-black text-2xl">Salary</h1>
          <p className="text-white/50 text-sm mt-0.5">
            {profile.country === 'US' ? '🇺🇸 US Payroll' : '🇮🇳 India Payroll'}
          </p>
        </div>
      </div>

      <div className="px-4 -mt-8 pb-10 space-y-4">

        {/* ── Month selector ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Month</label>
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="w-full appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800 focus:outline-none focus:border-[#1B2B5E] pr-10"
            >
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const val = d.toISOString().slice(0, 7);
                return <option key={val} value={val}>{monthLabel(val)}</option>;
              })}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {statusBadge && (
            <div className="mt-2.5 flex items-center justify-between">
              <div className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                statusBadge === 'Ready'   ? 'bg-green-100 text-green-700' :
                statusBadge === 'On Hold' ? 'bg-red-100 text-red-600' :
                                            'bg-amber-100 text-amber-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  statusBadge === 'Ready'   ? 'bg-green-500' :
                  statusBadge === 'On Hold' ? 'bg-red-500' :
                                              'bg-amber-400'
                }`} />
                {statusBadge ?? 'Pending'}
              </div>

              {canDownload && (
                <button
                  onClick={downloadPayslip}
                  className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-[#1B2B5E] text-white hover:bg-[#2D4080] active:scale-95 transition-all"
                >
                  <Download size={11} />
                  Download
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── No entry for selected month ─────────────────────────────────── */}
        {!calc ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <FileText size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No payslip for {monthLabel(selectedMonth)}</p>
            <p className="text-xs text-gray-300 mt-1">HR hasn&apos;t processed this month yet</p>
          </div>
        ) : (
          <>
            {/* ── Net pay hero ─────────────────────────────────────────────── */}
            <div className="bg-[#1B2B5E] rounded-2xl p-5 shadow-xl shadow-[#1B2B5E]/20">
              <p className="text-white/50 text-xs uppercase tracking-wider mb-1">Net Pay</p>
              <p className="text-white font-black text-4xl leading-none">{fmt(calc.net)}</p>
              <p className="text-white/30 text-xs mt-1">{monthLabel(selectedMonth)}</p>
              <div className="flex gap-6 mt-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">Gross</p>
                  <p className="text-white/80 font-bold text-sm mt-0.5">{fmt(calc.gross)}</p>
                </div>
                <div>
                  <p className="text-white/40 text-[10px] uppercase tracking-wider">Deductions</p>
                  <p className="text-red-400 font-bold text-sm mt-0.5">-{fmt(calc.totalDed)}</p>
                </div>
              </div>
            </div>

            {/* ── Earnings breakdown ──────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-green-50/60 flex items-center gap-2">
                <TrendingUp size={13} className="text-green-600" />
                <span className="text-xs font-bold text-green-700 uppercase tracking-wider">Earnings</span>
              </div>
              <div className="px-5">
                {isUS ? (
                  <>
                    <Row label="Base Salary" val={fmt(profile.baseSalary)} />
                    {calc.otPay > 0 && (
                      <Row label={`Overtime (${calc.otHours}h)`} val={fmt(calc.otPay)} vc="text-green-600" />
                    )}
                    {calc.adj !== 0 && (
                      <Row
                        label="Adjustments"
                        val={`${calc.adj >= 0 ? '+' : ''}${fmt(calc.adj)}`}
                        vc={calc.adj >= 0 ? 'text-green-600' : 'text-red-500'}
                      />
                    )}
                  </>
                ) : (
                  <>
                    <Row label="Basic Salary" val={fmt((calc as any).basic)} />
                    <Row label="HRA" val={fmt((calc as any).hra)} />
                    {(calc as any).special > 0 && <Row label="Special Allowance" val={fmt((calc as any).special)} />}
                    {(calc as any).lta > 0 && <Row label="LTA (monthly)" val={fmt((calc as any).lta)} />}
                    {(calc as any).medical > 0 && <Row label="Medical Allowance" val={fmt((calc as any).medical)} />}
                    {calc.otPay > 0 && (
                      <Row label={`Overtime (${calc.otHours}h)`} val={fmt(calc.otPay)} vc="text-green-600" />
                    )}
                    {calc.adj !== 0 && (
                      <Row
                        label="Adjustments"
                        val={`${calc.adj >= 0 ? '+' : ''}${fmt(calc.adj)}`}
                        vc={calc.adj >= 0 ? 'text-green-600' : 'text-red-500'}
                      />
                    )}
                  </>
                )}
                <div className="flex items-center justify-between py-3">
                  <span className="text-xs font-black text-gray-800">Total Earnings</span>
                  <span className="text-xs font-black text-green-600">{fmt(calc.gross)}</span>
                </div>
              </div>
            </div>

            {/* ── Deductions breakdown ─────────────────────────────────────── */}
            {calc.totalDed > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-red-50/60 flex items-center gap-2">
                  <ArrowDownRight size={13} className="text-red-500" />
                  <span className="text-xs font-bold text-red-600 uppercase tracking-wider">Deductions</span>
                </div>
                <div className="px-5">
                  {isUS ? (
                    <>
                      {(calc as any).k401 > 0 && (
                        <Row label={`401(k) (${profile.k401Pct}%)`} val={`-${fmt((calc as any).k401)}`} vc="text-red-500" />
                      )}
                      {(calc as any).health > 0 && (
                        <Row label="Health Insurance" val={`-${fmt((calc as any).health)}`} vc="text-red-500" />
                      )}
                      {calc.lwp > 0 && (
                        <Row label={`Leave Without Pay (${entry?.unpaidLeaveDays}d)`} val={`-${fmt(calc.lwp)}`} vc="text-red-500" />
                      )}
                    </>
                  ) : (
                    <>
                      {(calc as any).pf > 0 && (
                        <Row label={`PF Employee (${(calc as any).pfRate}%)`} val={`-${fmt((calc as any).pf)}`} vc="text-red-500" />
                      )}
                      {(calc as any).esi > 0 && (
                        <Row label="ESI (0.75%)" val={`-${fmt((calc as any).esi)}`} vc="text-red-500" />
                      )}
                      {calc.lwp > 0 && (
                        <Row label={`Leave Without Pay (${entry?.unpaidLeaveDays}d)`} val={`-${fmt(calc.lwp)}`} vc="text-red-500" />
                      )}
                    </>
                  )}
                  <div className="flex items-center justify-between py-3">
                    <span className="text-xs font-black text-gray-800">Total Deductions</span>
                    <span className="text-xs font-black text-red-600">-{fmt(calc.totalDed)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Net pay summary ──────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex items-center justify-between">
              <p className="font-black text-gray-900 text-sm">Net Pay — {monthLabel(selectedMonth)}</p>
              <p className="font-black text-xl text-[#1B2B5E]">{fmt(calc.net)}</p>
            </div>
          </>
        )}

        {/* ── Payslip history list ─────────────────────────────────────────── */}
        {entries.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2">
              <Receipt size={12} className="text-gray-400" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Payslip History</p>
            </div>
            <div className="divide-y divide-gray-50">
              {entries.map((e: any) => {
                const isSelected = e.month === selectedMonth;
                return (
                  <button
                    key={e.month}
                    onClick={() => setSelectedMonth(e.month)}
                    className={`w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors ${isSelected ? 'bg-[#1B2B5E]/5' : ''}`}
                  >
                    <div className="text-left">
                      <p className={`text-sm font-semibold ${isSelected ? 'text-[#1B2B5E]' : 'text-gray-800'}`}>
                        {monthLabel(e.month)}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${
                        e.status === 'Ready'   ? 'text-green-500' :
                        e.status === 'On Hold' ? 'text-red-500' :
                        'text-amber-500'
                      }`}>{e.status ?? 'Pending'}</p>
                    </div>
                    <div className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      e.status === 'Ready'   ? 'bg-green-100 text-green-700' :
                      e.status === 'On Hold' ? 'bg-red-100 text-red-600' :
                                               'bg-amber-100 text-amber-700'
                    }`}>
                      {e.status ?? 'Pending'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
