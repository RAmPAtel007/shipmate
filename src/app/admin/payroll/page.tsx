'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, Download, CheckCircle2, ChevronRight, X, FileText,
  TrendingUp, Search, Printer, Building2, Calculator, Edit2, Plus,
  Loader2, Save, ChevronDown,
} from 'lucide-react';
import {
  collection, onSnapshot, doc, setDoc, serverTimestamp,
  query, where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuth } from '@/contexts/AuthContext';
import type { ShipmateUser } from '@/lib/types';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_MONTH = '2026-05';
const MONTH_LABEL   = 'May 2026';

// All 50 US states + DC, alphabetical
const US_STATES = [
  'AK','AL','AR','AZ','CA','CO','CT','DC','DE','FL',
  'GA','HI','IA','ID','IL','IN','KS','KY','LA','MA',
  'MD','ME','MI','MN','MO','MS','MT','NC','ND','NE',
  'NH','NJ','NM','NV','NY','OH','OK','OR','PA','RI',
  'SC','SD','TN','TX','UT','VA','VT','WA','WI','WV','WY',
];

// All 28 Indian States + 8 Union Territories
const IN_STATES = [
  // States
  'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
  'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand',
  'Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur',
  'Meghalaya','Mizoram','Nagaland','Odisha','Punjab',
  'Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura',
  'Uttar Pradesh','Uttarakhand','West Bengal',
  // Union Territories
  'Delhi','Chandigarh','Dadra & Nagar Haveli','Daman & Diu',
  'Jammu & Kashmir','Ladakh','Lakshadweep','Puducherry',
  'Andaman & Nicobar Islands',
];

// Flat / effective state income tax rate (2026 approximation)
const STATE_TAX: Record<string, number> = {
  AK:0,      AL:0.050,  AR:0.044,  AZ:0.025,  CA:0.093,
  CO:0.044,  CT:0.050,  DC:0.085,  DE:0.055,  FL:0,
  GA:0.0549, HI:0.079,  IA:0.038,  ID:0.058,  IL:0.0495,
  IN:0.0305, KS:0.057,  KY:0.040,  LA:0.030,  MA:0.050,
  MD:0.0475, ME:0.058,  MI:0.0405, MN:0.0535, MO:0.0495,
  MS:0.047,  MT:0.059,  NC:0.045,  ND:0.011,  NE:0.0384,
  NH:0,      NJ:0.0553, NM:0.049,  NV:0,      NY:0.065,
  OH:0.035,  OK:0.045,  OR:0.0875, PA:0.0307, RI:0.0475,
  SC:0.064,  SD:0,      TN:0,      TX:0,      UT:0.0485,
  VA:0.0575, VT:0.053,  WA:0,      WI:0.044,  WV:0.040,
  WY:0,
};

// State Disability Insurance — employee rate (2026, states that have it)
const STATE_SDI: Record<string, number> = {
  CA:0.011, NJ:0.0047, NY:0.005, HI:0.005, RI:0.011,
};

// Professional Tax by state/UT (₹/month, 2026)
const IN_PT: Record<string, number> = {
  // States with PT
  Maharashtra:200,     Karnataka:200,      'Tamil Nadu':208,
  Telangana:200,       Kerala:208,         Gujarat:200,
  'West Bengal':200,   'Andhra Pradesh':200, 'Madhya Pradesh':208,
  Odisha:200,          Assam:208,          Sikkim:200,
  Meghalaya:200,       Tripura:208,        Manipur:208,
  // States with NO PT (0)
  'Arunachal Pradesh':0, Bihar:0,          Chhattisgarh:0,
  Goa:0,               Haryana:0,          'Himachal Pradesh':0,
  Jharkhand:0,         Mizoram:0,          Nagaland:0,
  Punjab:0,            Rajasthan:0,        'Uttar Pradesh':0,
  Uttarakhand:0,
  // Union Territories
  Delhi:0,             Chandigarh:0,       'Dadra & Nagar Haveli':0,
  'Daman & Diu':0,     'Jammu & Kashmir':0, Ladakh:0,
  Lakshadweep:0,       Puducherry:208,     'Andaman & Nicobar Islands':0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Country   = 'US' | 'IN';
type EmpStatus = 'Ready' | 'Pending' | 'On Hold';

/** payrollProfiles/{uid} — salary structure, persists across months */
interface PayrollProfile {
  uid: string;
  country: Country;
  // US
  baseSalary: number;
  usState: string;
  k401Pct: number;
  healthIns: number;
  // India
  basic: number;
  hra: number;
  specialAllowance: number;
  lta: number;        // annual ₹
  medical: number;
  pfApplicable: boolean;
  pfRate: number;     // PF % — default 12, editable when pfApplicable=true
  esiApplicable: boolean;
  inState: string;
  // meta
  updatedAt?: any;
  updatedBy?: string;
}

/** payrollEntries/{uid}_{month} — monthly OT, adjustments, status */
interface PayrollEntry {
  uid: string;
  month: string;
  country: Country;
  otHours: number;
  otPay: number;
  adjustments: number;    // +bonus / -deduction
  unpaidLeaveDays: number;// LWP — deducted from gross at daily rate
  paidLeaveDays: number;  // paid leave taken (no deduction, for record)
  status: EmpStatus;
  notes: string;
  updatedAt?: any;
  updatedBy?: string;
}

/** Form state used inside the edit modal */
interface ModalForm {
  // profile
  country: Country;
  baseSalary: number;
  usState: string;
  k401Pct: number;
  healthIns: number;
  basic: number;
  hra: number;
  specialAllowance: number;
  lta: number;
  medical: number;
  pfApplicable: boolean;
  pfRate: number;
  esiApplicable: boolean;
  inState: string;
  // monthly entry
  otHours: number;
  otPay: number;
  adjustments: number;
  unpaidLeaveDays: number;
  paidLeaveDays: number;
  status: EmpStatus;
  notes: string;
}

// ─── Tax Calculations ─────────────────────────────────────────────────────────

function calcUSFedTax(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 14600);
  const b: [number, number][] = [
    [11600,0.10],[47150,0.12],[100525,0.22],
    [191950,0.24],[243725,0.32],[609350,0.35],[Infinity,0.37],
  ];
  let tax = 0, prev = 0;
  for (const [limit, rate] of b) {
    if (taxable <= prev) break;
    tax += (Math.min(taxable, limit) - prev) * rate;
    prev = limit;
  }
  return Math.round(tax / 12);
}

function calcUSPayroll(p: PayrollProfile, e: PayrollEntry) {
  // LWP: per-day rate = baseSalary / 22 working days
  const lwpDeduction = e.unpaidLeaveDays > 0
    ? Math.round((p.baseSalary / 22) * e.unpaidLeaveDays) : 0;
  const gross      = p.baseSalary - lwpDeduction + e.otPay + e.adjustments;
  const annualGross = gross * 12;
  const fedTax     = calcUSFedTax(p.baseSalary * 12);
  const stateTax   = Math.round(gross * (STATE_TAX[p.usState] ?? 0));
  const ssCapped   = Math.min(annualGross, 168600) / 12;
  const ss         = Math.round(ssCapped * 0.062);
  const addlMedicare = annualGross > 200000 ? Math.round((annualGross - 200000) * 0.009 / 12) : 0;
  const medicare   = Math.round(gross * 0.0145) + addlMedicare;
  const k401       = Math.round(gross * p.k401Pct / 100);
  const sdi        = Math.round(gross * (STATE_SDI[p.usState] ?? 0));
  const ded        = fedTax + stateTax + ss + medicare + k401 + p.healthIns + sdi;
  return { gross, lwpDeduction, fedTax, stateTax, ss, medicare, addlMedicare, k401, healthIns:p.healthIns, sdi, ded, net:gross-ded, erSS:ss, erMedicare:Math.round(gross*0.0145) };
}

function calcINTDS(annualGross: number): number {
  const taxable = Math.max(0, annualGross - 75000);
  if (taxable <= 1200000) return 0;
  const s: [number,number][] = [
    [400000,0],[800000,0.05],[1200000,0.10],
    [1600000,0.15],[2000000,0.20],[2400000,0.25],[Infinity,0.30],
  ];
  let tax=0, prev=0;
  for (const [lim,rate] of s) {
    if (taxable<=prev) break;
    tax += (Math.min(taxable,lim)-prev)*rate;
    prev=lim;
  }
  return Math.round(tax*1.04/12);
}

function calcINPayroll(p: PayrollProfile, e: PayrollEntry) {
  const ltaM  = Math.round(p.lta / 12);
  const pfRate = p.pfApplicable ? ((p.pfRate ?? 12) / 100) : 0;
  // LWP: per-day rate = basic / 26 working days (India standard)
  const lwpDeduction = e.unpaidLeaveDays > 0
    ? Math.round((p.basic / 26) * e.unpaidLeaveDays) : 0;
  const gross = p.basic + p.hra + p.specialAllowance + ltaM + p.medical
                + e.otPay + e.adjustments - lwpDeduction;
  const pf    = p.pfApplicable ? Math.round(p.basic * pfRate) : 0;
  const esi   = (p.esiApplicable && gross <= 21000) ? Math.round(gross * 0.0075) : 0;
  const pt    = IN_PT[p.inState] ?? 0;
  const tds   = calcINTDS(gross * 12);
  const ded   = pf + esi + pt + tds;
  return {
    gross, lwpDeduction, pf, esi, pt, tds, ded, net:gross-ded,
    erPF: p.pfApplicable ? Math.round(p.basic * pfRate) : 0,
    erESI: (p.esiApplicable&&gross<=21000) ? Math.round(gross*0.0325) : 0,
    gratuity: Math.round(p.basic*0.0481),
    basic:p.basic, hra:p.hra, specialAllowance:p.specialAllowance, lta:ltaM, medical:p.medical,
    pfRatePct: (p.pfRate ?? 12),
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtUSD  = (n:number) => '$'+n.toLocaleString('en-US');
const fmtINR  = (n:number) => '₹'+n.toLocaleString('en-IN');
const fmtUSDk = (n:number) => n>=1000 ? '$'+(n/1000).toFixed(1)+'k' : '$'+n;
const fmtINRk = (n:number) => {
  if (n>=100000) return '₹'+(n/100000).toFixed(1)+'L';
  if (n>=1000)   return '₹'+(n/1000).toFixed(1)+'k';
  return '₹'+n;
};

// ─── Print / PDF helper ───────────────────────────────────────────────────────

function printElement(id: string, title: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const win = window.open('', '_blank', 'width=560,height=900');
  if (!win) return;
  const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]'))
    .map(s => s.outerHTML).join('\n');
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title>${styles}
    <style>
      body { margin: 0; background: white; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head><body>${el.outerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

function downloadElement(id: string, filename: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]'))
    .map(s => s.outerHTML).join('\n');
  const html = `<!DOCTYPE html><html><head><title>${filename}</title>${styles}
    <style>
      body { margin: 0; background: white; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style>
  </head><body>${el.outerHTML}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[^a-z0-9_\-. ]/gi, '_') + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

// ─── Default form helpers ─────────────────────────────────────────────────────

function blankForm(country: Country): ModalForm {
  return {
    country,
    baseSalary:0, usState:'CA', k401Pct:6, healthIns:450,
    basic:0, hra:0, specialAllowance:0, lta:0, medical:1250,
    pfApplicable:true, pfRate:12, esiApplicable:false, inState:'Maharashtra',
    otHours:0, otPay:0, adjustments:0,
    unpaidLeaveDays:0, paidLeaveDays:0,
    status:'Pending', notes:'',
  };
}

function profileToForm(profile: PayrollProfile, entry?: PayrollEntry): ModalForm {
  return {
    country: profile.country,
    baseSalary: profile.baseSalary ?? 0,
    usState: profile.usState ?? 'CA',
    k401Pct: profile.k401Pct ?? 6,
    healthIns: profile.healthIns ?? 450,
    basic: profile.basic ?? 0,
    hra: profile.hra ?? 0,
    specialAllowance: profile.specialAllowance ?? 0,
    lta: profile.lta ?? 0,
    medical: profile.medical ?? 1250,
    pfApplicable: profile.pfApplicable ?? true,
    pfRate: profile.pfRate ?? 12,
    esiApplicable: profile.esiApplicable ?? false,
    inState: profile.inState ?? 'Maharashtra',
    otHours: entry?.otHours ?? 0,
    otPay: entry?.otPay ?? 0,
    adjustments: entry?.adjustments ?? 0,
    unpaidLeaveDays: entry?.unpaidLeaveDays ?? 0,
    paidLeaveDays: entry?.paidLeaveDays ?? 0,
    status: entry?.status ?? 'Pending',
    notes: entry?.notes ?? '',
  };
}

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EmpStatus }) {
  const cls: Record<EmpStatus,string> = {
    'Ready':'bg-green-50 text-green-700',
    'Pending':'bg-amber-50 text-amber-700',
    'On Hold':'bg-red-50 text-red-600',
  };
  return <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls[status]}`}>{status}</span>;
}

function FL({ label }: { label:string }) {
  return <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">{label}</label>;
}

function FInput({ value, onChange, type='text', prefix, min=0, placeholder='' }: {
  value:number|string; onChange:(v:string)=>void;
  type?:string; prefix?:string; min?:number; placeholder?:string;
}) {
  return (
    <div className="relative">
      {prefix && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">{prefix}</span>}
      <input
        type={type} value={value} min={min} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={`w-full border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-800 placeholder-gray-300
          outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all
          ${prefix ? 'pl-7 pr-3' : 'px-3'}`}
      />
    </div>
  );
}

function FSelect({ value, onChange, opts }: { value:string; onChange:(v:string)=>void; opts:string[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-800
        outline-none focus:border-[#1B2B5E] bg-white transition-all">
      {opts.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── Payslip Modal (US) ───────────────────────────────────────────────────────

function USPayslipModal({ user, profile, entry, onClose }: {
  user:ShipmateUser; profile:PayrollProfile; entry:PayrollEntry; onClose:()=>void;
}) {
  const p = calcUSPayroll(profile, entry);
  const initials = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const printId = `us-payslip-${user.uid}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}/>
      <div id={printId} className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col overflow-y-auto">
        <div className="bg-[#1B2B5E] px-6 py-5">
          <div className="flex items-start justify-between mb-4">
            <div><p className="text-xs text-white/50 uppercase tracking-wide font-medium">Pay Stub</p>
              <p className="text-lg font-black text-white mt-0.5">{MONTH_LABEL}</p></div>
            <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20}/></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">{initials}</div>
            <div><p className="font-bold text-white">{user.name}</p>
              <p className="text-white/50 text-xs">{user.email} · {profile.usState}</p></div>
          </div>
        </div>
        <div className="flex-1 px-6 py-5 space-y-5">
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Earnings</p>
            <div className="space-y-2">
              <PSRow label="Base Salary" val={fmtUSD(profile.baseSalary)}/>
              {p.lwpDeduction > 0 && <PSRow label={`Leave Without Pay (${entry.unpaidLeaveDays} days)`} val={`-${fmtUSD(p.lwpDeduction)}`} vc="text-red-500"/>}
              {entry.otPay>0 && <PSRow label={`Overtime (${entry.otHours} hrs)`} val={fmtUSD(entry.otPay)} vc="text-amber-500"/>}
              {entry.adjustments!==0 && <PSRow label={entry.adjustments>0?'Bonus':'Deduction'} val={(entry.adjustments>0?'+':'')+fmtUSD(entry.adjustments)} vc={entry.adjustments>0?'text-green-600':'text-red-500'}/>}
              <PSRow label="Gross Pay" val={fmtUSD(p.gross)} bold border/>
            </div>
          </section>
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Deductions</p>
            <div className="space-y-2">
              <PSRow label="Federal Income Tax" val={`-${fmtUSD(p.fedTax)}`} vc="text-red-500"/>
              <PSRow label={`${profile.usState} State Tax${STATE_TAX[profile.usState]===0?' (None)':''}`}
                val={STATE_TAX[profile.usState]===0?'—':`-${fmtUSD(p.stateTax)}`}
                vc={STATE_TAX[profile.usState]===0?'text-green-600':'text-red-500'}/>
              <PSRow label={`Social Security (6.2%${p.ss !== Math.round(p.gross*0.062) ? ' · wage base cap' : ''})`} val={`-${fmtUSD(p.ss)}`} vc="text-red-400"/>
              <PSRow label={`Medicare (1.45%${p.addlMedicare > 0 ? ' + 0.9% surtax' : ''})`} val={`-${fmtUSD(p.medicare)}`} vc="text-red-400"/>
              <PSRow label={`401(k) ${profile.k401Pct}%`} val={`-${fmtUSD(p.k401)}`} vc="text-red-400"/>
              <PSRow label="Health Insurance" val={`-${fmtUSD(p.healthIns)}`} vc="text-red-400"/>
              {p.sdi > 0 && <PSRow label={`${profile.usState} SDI`} val={`-${fmtUSD(p.sdi)}`} vc="text-red-400"/>}
              <PSRow label="Total Deductions" val={`-${fmtUSD(p.ded)}`} vc="text-red-600" bold border/>
            </div>
          </section>
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Employer Contributions</p>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <PSRow label="Social Security Match" val={fmtUSD(p.erSS)} vc="text-gray-600"/>
              <PSRow label="Medicare Match" val={fmtUSD(p.erMedicare)} vc="text-gray-600"/>
            </div>
          </section>
          <div className="bg-[#1B2B5E] rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-white/50 text-[11px] uppercase tracking-wider">Net Pay</p>
              <p className="text-white text-3xl font-black mt-1">{fmtUSD(p.net)}</p>
              <p className="text-white/40 text-xs mt-0.5">Direct deposit · {MONTH_LABEL.split(' ')[1] === '2026' ? '31 May' : ''}</p>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
              <DollarSign size={20} className="text-[#F5C518]"/>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <button
            onClick={() => printElement(printId, `Pay Stub - ${user.name} - ${MONTH_LABEL}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-[#1B2B5E] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2D4080] transition-colors"
          >
            <Printer size={14}/>Print / Save PDF
          </button>
          <button
            onClick={() => downloadElement(printId, `Pay Stub - ${user.name} - ${MONTH_LABEL}`)}
            title="Download as file"
            className="flex items-center gap-2 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Payslip Modal (India) ────────────────────────────────────────────────────

function INPayslipModal({ user, profile, entry, onClose }: {
  user:ShipmateUser; profile:PayrollProfile; entry:PayrollEntry; onClose:()=>void;
}) {
  const p = calcINPayroll(profile, entry);
  const ctc = (p.gross + p.erPF + p.gratuity) * 12;
  const initials = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const printId = `in-payslip-${user.uid}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose}/>
      <div id={printId} className="relative w-full max-w-md h-full bg-white shadow-2xl flex flex-col overflow-y-auto">
        <div className="bg-[#1B2B5E] px-6 py-5">
          <div className="flex items-start justify-between mb-4">
            <div><p className="text-xs text-white/50 uppercase tracking-wide font-medium">Salary Slip</p>
              <p className="text-lg font-black text-white mt-0.5">{MONTH_LABEL}</p></div>
            <button onClick={onClose} className="text-white/50 hover:text-white"><X size={20}/></button>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">{initials}</div>
            <div><p className="font-bold text-white">{user.name}</p>
              <p className="text-white/50 text-xs">{user.email} · {profile.inState}</p></div>
          </div>
        </div>
        <div className="flex-1 px-6 py-5 space-y-5">
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Gross Earnings</p>
            <div className="space-y-2">
              <PSRow label="Basic Salary" val={fmtINR(p.basic)}/>
              <PSRow label="HRA" val={fmtINR(p.hra)}/>
              <PSRow label="Special Allowance" val={fmtINR(p.specialAllowance)}/>
              <PSRow label="LTA (Monthly)" val={fmtINR(p.lta)}/>
              <PSRow label="Medical Allowance" val={fmtINR(p.medical)}/>
              {entry.otPay>0 && <PSRow label={`Overtime (${entry.otHours} hrs)`} val={fmtINR(entry.otPay)} vc="text-amber-500"/>}
              {entry.adjustments!==0 && <PSRow label={entry.adjustments>0?'Bonus':'Deduction'} val={(entry.adjustments>0?'+':'')+fmtINR(entry.adjustments)} vc={entry.adjustments>0?'text-green-600':'text-red-500'}/>}
              {p.lwpDeduction > 0 && <PSRow label={`Leave Without Pay (${entry.unpaidLeaveDays} days)`} val={`-${fmtINR(p.lwpDeduction)}`} vc="text-red-500"/>}
              <PSRow label="Total Gross" val={fmtINR(p.gross)} bold border/>
            </div>
          </section>
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Deductions</p>
            <div className="space-y-2">
              {profile.pfApplicable && <PSRow label={`PF — Employee ${p.pfRatePct}%`} val={`-${fmtINR(p.pf)}`} vc="text-red-500"/>}
              {p.esi>0 && <PSRow label="ESI — Employee 0.75%" val={`-${fmtINR(p.esi)}`} vc="text-red-400"/>}
              <PSRow label={`Professional Tax (${profile.inState})`}
                val={p.pt>0?`-${fmtINR(p.pt)}`:'Nil'} vc={p.pt>0?'text-red-400':'text-green-600'}/>
              {p.tds>0
                ? <PSRow label="TDS — Income Tax" val={`-${fmtINR(p.tds)}`} vc="text-red-500"/>
                : <PSRow label="TDS — 87A Rebate Applied" val="₹0" vc="text-green-600"/>}
              <PSRow label="Total Deductions" val={`-${fmtINR(p.ded)}`} vc="text-red-600" bold border/>
            </div>
          </section>
          <section>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Employer Contributions</p>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <PSRow label={`PF — Employer ${p.pfRatePct}%`} val={fmtINR(p.erPF)} vc="text-gray-600"/>
              {p.erESI>0 && <PSRow label="ESI — Employer 3.25%" val={fmtINR(p.erESI)} vc="text-gray-600"/>}
              <PSRow label="Gratuity (4.81%)" val={fmtINR(p.gratuity)} vc="text-gray-600"/>
            </div>
          </section>
          <div className="bg-[#1B2B5E] rounded-2xl p-5 flex items-center justify-between">
            <div>
              <p className="text-white/50 text-[11px] uppercase tracking-wider">Net Take-Home</p>
              <p className="text-white text-3xl font-black mt-1">{fmtINR(p.net)}</p>
              <p className="text-white/40 text-xs mt-0.5">NEFT / IMPS · 31 May</p>
            </div>
            <div className="text-right">
              <p className="text-[#F5C518]/70 text-xs font-medium">Annual CTC</p>
              <p className="text-[#F5C518] font-black text-xl">{fmtINRk(ctc)}</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t flex gap-3">
          <button
            onClick={() => printElement(printId, `Salary Slip - ${user.name} - ${MONTH_LABEL}`)}
            className="flex-1 flex items-center justify-center gap-2 bg-[#1B2B5E] text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-[#2D4080] transition-colors"
          >
            <Printer size={14}/>Print / Save PDF
          </button>
          <button
            onClick={() => downloadElement(printId, `Salary Slip - ${user.name} - ${MONTH_LABEL}`)}
            title="Download as file"
            className="flex items-center gap-2 border border-gray-200 text-gray-600 text-sm font-semibold py-2.5 px-4 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Download size={14}/>
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared payslip row
function PSRow({ label, val, vc='text-gray-800', bold=false, border=false }:{
  label:string; val:string; vc?:string; bold?:boolean; border?:boolean;
}) {
  return (
    <div className={`flex justify-between items-center text-sm${bold?' font-bold':''}${border?' border-t border-gray-100 pt-2 mt-1':''}`}>
      <span className={bold?'text-gray-900':'text-gray-500'}>{label}</span>
      <span className={vc}>{val}</span>
    </div>
  );
}

// ─── Edit / Add Modal ─────────────────────────────────────────────────────────

function EditPayrollModal({
  user, existingProfile, existingEntry, defaultCountry, adminUid, onClose,
}: {
  user: ShipmateUser;
  existingProfile?: PayrollProfile;
  existingEntry?: PayrollEntry;
  defaultCountry: Country;
  adminUid: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ModalForm>(
    existingProfile
      ? profileToForm(existingProfile, existingEntry)
      : blankForm(defaultCountry)
  );
  const [saving, setSaving] = useState(false);

  // Live preview of calculated payroll
  const liveProfile: PayrollProfile = {
    uid: user.uid, country: form.country,
    baseSalary: Number(form.baseSalary)||0, usState: form.usState,
    k401Pct: Number(form.k401Pct)||0, healthIns: Number(form.healthIns)||0,
    basic: Number(form.basic)||0, hra: Number(form.hra)||0,
    specialAllowance: Number(form.specialAllowance)||0,
    lta: Number(form.lta)||0, medical: Number(form.medical)||0,
    pfApplicable: form.pfApplicable, pfRate: Number(form.pfRate)||12,
    esiApplicable: form.esiApplicable,
    inState: form.inState,
  };
  const liveEntry: PayrollEntry = {
    uid: user.uid, month: CURRENT_MONTH, country: form.country,
    otHours: Number(form.otHours)||0, otPay: Number(form.otPay)||0,
    adjustments: Number(form.adjustments)||0,
    unpaidLeaveDays: Number(form.unpaidLeaveDays)||0,
    paidLeaveDays: Number(form.paidLeaveDays)||0,
    status: form.status, notes: form.notes,
  };

  const usCalc  = form.country === 'US' ? calcUSPayroll(liveProfile, liveEntry) : null;
  const inCalc  = form.country === 'IN' ? calcINPayroll(liveProfile, liveEntry) : null;

  // Auto-calc US OT pay from hours (1.5× hourly)
  function handleOTHours(v: string) {
    const hrs = Number(v)||0;
    if (form.country === 'US' && form.baseSalary) {
      const hourly = (Number(form.baseSalary)||0) / 160;
      setForm(f => ({ ...f, otHours: hrs, otPay: Math.round(hourly * 1.5 * hrs) }));
    } else {
      setForm(f => ({ ...f, otHours: hrs }));
    }
  }

  async function handleSave() {
    if (form.country === 'US' && (!form.baseSalary || form.baseSalary <= 0)) {
      toast.error('Please enter a valid base salary'); return;
    }
    if (form.country === 'IN' && (!form.basic || form.basic <= 0)) {
      toast.error('Please enter a valid basic salary'); return;
    }
    setSaving(true);
    try {
      // Save payroll profile
      await setDoc(doc(db, 'payrollProfiles', user.uid), {
        uid: user.uid, country: form.country,
        baseSalary: Number(form.baseSalary)||0, usState: form.usState,
        k401Pct: Number(form.k401Pct)||0, healthIns: Number(form.healthIns)||0,
        basic: Number(form.basic)||0, hra: Number(form.hra)||0,
        specialAllowance: Number(form.specialAllowance)||0,
        lta: Number(form.lta)||0, medical: Number(form.medical)||0,
        pfApplicable: form.pfApplicable, pfRate: Number(form.pfRate)||12,
        esiApplicable: form.esiApplicable,
        inState: form.inState,
        updatedAt: serverTimestamp(), updatedBy: adminUid,
      });

      // Save monthly entry
      const entryId = `${user.uid}_${CURRENT_MONTH}`;
      await setDoc(doc(db, 'payrollEntries', entryId), {
        uid: user.uid, month: CURRENT_MONTH, country: form.country,
        otHours: Number(form.otHours)||0, otPay: Number(form.otPay)||0,
        adjustments: Number(form.adjustments)||0,
        unpaidLeaveDays: Number(form.unpaidLeaveDays)||0,
        paidLeaveDays: Number(form.paidLeaveDays)||0,
        status: form.status, notes: form.notes,
        updatedAt: serverTimestamp(), updatedBy: adminUid,
      });

      toast.success(`${user.name}'s payroll ${existingProfile ? 'updated' : 'configured'}!`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof ModalForm) => (v: string | boolean) =>
    setForm(f => ({ ...f, [k]: typeof v === 'boolean' ? v : v }));

  const initials = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose}/>
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-[#1B2B5E] px-6 py-5 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm">{initials}</div>
            <div>
              <p className="text-white font-black text-base">{user.name}</p>
              <p className="text-white/50 text-xs">{user.email} · {user.department}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white mt-1"><X size={20}/></button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* LEFT — Salary Structure */}
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-800 flex items-center gap-2">
                <Building2 size={14} className="text-[#1B2B5E]"/>
                Salary Structure
              </p>

              {/* Country (only editable if no existing profile) */}
              <div>
                <FL label="Country / Currency"/>
                {existingProfile ? (
                  <div className="flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5 bg-gray-50">
                    <span className="text-base">{form.country === 'US' ? '🇺🇸' : '🇮🇳'}</span>
                    <span className="text-sm font-semibold text-gray-700">{form.country === 'US' ? 'United States · USD' : 'India · INR'}</span>
                    <span className="ml-auto text-[10px] text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">Fixed</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(['US','IN'] as Country[]).map(c => (
                      <button key={c} onClick={() => setForm(f=>({...f, country:c}))}
                        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                          form.country===c ? 'bg-[#1B2B5E] text-white border-[#1B2B5E]' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        <span>{c==='US'?'🇺🇸':'🇮🇳'}</span>
                        {c==='US'?'US · USD':'India · INR'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.country === 'US' ? (
                <>
                  <div><FL label="Monthly Base Salary (USD)"/>
                    <FInput value={form.baseSalary} onChange={set('baseSalary')} type="number" prefix="$" min={0}/></div>
                  <div><FL label="State"/>
                    <FSelect value={form.usState} onChange={set('usState')} opts={US_STATES}/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FL label="401(k) %"/>
                      <FInput value={form.k401Pct} onChange={set('k401Pct')} type="number" min={0}/></div>
                    <div><FL label="Health Ins / mo"/>
                      <FInput value={form.healthIns} onChange={set('healthIns')} type="number" prefix="$" min={0}/></div>
                  </div>
                </>
              ) : (
                <>
                  <div><FL label="Basic Salary / month (₹)"/>
                    <FInput value={form.basic} onChange={set('basic')} type="number" prefix="₹" min={0}/></div>
                  <div><FL label="HRA / month (₹)"/>
                    <FInput value={form.hra} onChange={set('hra')} type="number" prefix="₹" min={0}/></div>
                  <div><FL label="Special Allowance / month (₹)"/>
                    <FInput value={form.specialAllowance} onChange={set('specialAllowance')} type="number" prefix="₹" min={0}/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><FL label="LTA / year (₹)"/>
                      <FInput value={form.lta} onChange={set('lta')} type="number" prefix="₹" min={0}/></div>
                    <div><FL label="Medical / month (₹)"/>
                      <FInput value={form.medical} onChange={set('medical')} type="number" prefix="₹" min={0}/></div>
                  </div>
                  <div><FL label="State"/>
                    <FSelect value={form.inState} onChange={set('inState')} opts={IN_STATES}/></div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.pfApplicable}
                        onChange={e => setForm(f=>({...f, pfApplicable:e.target.checked}))}
                        className="w-4 h-4 rounded accent-[#1B2B5E]"/>
                      <span className="text-sm font-medium text-gray-700">PF Applicable</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.esiApplicable}
                        onChange={e => setForm(f=>({...f, esiApplicable:e.target.checked}))}
                        className="w-4 h-4 rounded accent-[#1B2B5E]"/>
                      <span className="text-sm font-medium text-gray-700">ESI Applicable</span>
                    </label>
                  </div>
                  {/* PF Rate — only shown/enabled when PF is applicable */}
                  <div className={`transition-all ${form.pfApplicable ? '' : 'opacity-40 pointer-events-none'}`}>
                    <FL label="PF Contribution Rate (%)"/>
                    <div className="relative">
                      <input
                        type="number" min={0} max={100}
                        value={form.pfApplicable ? form.pfRate : 12}
                        disabled={!form.pfApplicable}
                        onChange={e => setForm(f => ({ ...f, pfRate: Number(e.target.value)||0 }))}
                        className="w-full border border-gray-200 rounded-xl py-2.5 pl-3 pr-8 text-sm font-medium text-gray-800
                          outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all
                          disabled:bg-gray-50 disabled:cursor-not-allowed"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
                    </div>
                    {form.pfApplicable && (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Employee + Employer each contribute {form.pfRate || 12}% of basic (₹{Math.round((Number(form.basic)||0) * ((Number(form.pfRate)||12)/100)).toLocaleString('en-IN')} /mo each)
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* RIGHT — This Month + Live Preview */}
            <div className="space-y-4">
              <p className="text-sm font-black text-gray-800 flex items-center gap-2">
                <Calculator size={14} className="text-[#1B2B5E]"/>
                {MONTH_LABEL} · Adjustments
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div><FL label="OT Hours"/>
                  <FInput value={form.otHours} onChange={handleOTHours} type="number" min={0}/></div>
                <div>
                  <FL label={`OT Pay (${form.country==='US'?'$':'₹'})`}/>
                  <FInput value={form.otPay} onChange={set('otPay')} type="number" prefix={form.country==='US'?'$':'₹'} min={0}/>
                </div>
              </div>

              <div>
                <FL label={`Bonus / Deduction (${form.country==='US'?'$':'₹'}) — use negative for deductions`}/>
                <FInput value={form.adjustments} onChange={set('adjustments')} type="number" prefix={form.country==='US'?'$':'₹'}/>
              </div>

              <div>
                <FL label="Status"/>
                <div className="grid grid-cols-3 gap-2">
                  {(['Ready','Pending','On Hold'] as EmpStatus[]).map(s => (
                    <button key={s} onClick={() => setForm(f=>({...f, status:s}))}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        form.status===s
                          ? s==='Ready' ? 'bg-green-500 text-white border-green-500'
                          : s==='Pending' ? 'bg-amber-400 text-white border-amber-400'
                          : 'bg-red-500 text-white border-red-500'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}>{s}</button>
                  ))}
                </div>
              </div>

              <div>
                <FL label="Notes (optional)"/>
                <textarea value={form.notes} onChange={e => setForm(f=>({...f, notes:e.target.value}))}
                  rows={2} placeholder="e.g. Joining bonus, salary revision..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-300
                    outline-none focus:border-[#1B2B5E] focus:ring-2 focus:ring-[#1B2B5E]/10 transition-all resize-none"/>
              </div>

              {/* Leaves This Month */}
              <div className="border border-dashed border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
                <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span>📅</span> Leaves This Month
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FL label="Paid Leave Days"/>
                    <FInput value={form.paidLeaveDays} onChange={set('paidLeaveDays')} type="number" min={0} placeholder="0"/>
                  </div>
                  <div>
                    <FL label="Unpaid Days (LWP)"/>
                    <FInput value={form.unpaidLeaveDays} onChange={set('unpaidLeaveDays')} type="number" min={0} placeholder="0"/>
                  </div>
                </div>
                {Number(form.unpaidLeaveDays) > 0 && (
                  <div className="flex items-center justify-between bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    <span className="text-xs text-red-600 font-medium">
                      LWP deduction ({form.unpaidLeaveDays} day{Number(form.unpaidLeaveDays)!==1?'s':''})
                    </span>
                    <span className="text-xs font-black text-red-600">
                      -{form.country === 'US'
                        ? fmtUSD(Math.round((Number(form.baseSalary)||0) / 22 * (Number(form.unpaidLeaveDays)||0)))
                        : fmtINR(Math.round((Number(form.basic)||0) / 26 * (Number(form.unpaidLeaveDays)||0)))}
                    </span>
                  </div>
                )}
                {Number(form.paidLeaveDays) > 0 && (
                  <p className="text-[11px] text-green-600 font-medium">
                    ✓ {form.paidLeaveDays} paid leave day{Number(form.paidLeaveDays)!==1?'s':''} recorded — no salary deduction
                  </p>
                )}
              </div>

              {/* Live Preview */}
              <div className="bg-[#1B2B5E]/5 border border-[#1B2B5E]/10 rounded-2xl p-4 space-y-2">
                <p className="text-[11px] font-bold text-[#1B2B5E] uppercase tracking-wider">Live Preview</p>
                {form.country === 'US' && usCalc && (
                  <>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Base Salary</span><span className="font-semibold text-gray-700">{fmtUSD(Number(form.baseSalary)||0)}</span></div>
                    {usCalc.lwpDeduction > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">LWP ({form.unpaidLeaveDays} days)</span><span className="text-red-500 font-semibold">-{fmtUSD(usCalc.lwpDeduction)}</span></div>}
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Gross Pay</span><span className="font-bold text-gray-800">{fmtUSD(usCalc.gross)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Fed Tax</span><span className="text-red-400">-{fmtUSD(usCalc.fedTax)}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">State Tax ({form.usState})</span><span className={STATE_TAX[form.usState]===0?'text-green-600':'text-red-400'}>{STATE_TAX[form.usState]===0?'None':`-${fmtUSD(usCalc.stateTax)}`}</span></div>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">FICA (SS + Medicare)</span><span className="text-red-400">-{fmtUSD(usCalc.ss + usCalc.medicare)}</span></div>
                    {usCalc.sdi > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">{form.usState} SDI</span><span className="text-red-400">-{fmtUSD(usCalc.sdi)}</span></div>}
                    <div className="flex justify-between text-xs"><span className="text-gray-500">401(k) + Health Ins</span><span className="text-red-400">-{fmtUSD(usCalc.k401 + usCalc.healthIns)}</span></div>
                    <div className="flex justify-between text-sm border-t border-[#1B2B5E]/10 pt-2 mt-1">
                      <span className="font-bold text-[#1B2B5E]">Net Pay</span>
                      <span className="font-black text-[#1B2B5E] text-base">{fmtUSD(usCalc.net)}</span>
                    </div>
                  </>
                )}
                {form.country === 'IN' && inCalc && (
                  <>
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Basic + Allowances</span><span className="font-semibold text-gray-700">{fmtINR((Number(form.basic)||0) + (Number(form.hra)||0) + (Number(form.specialAllowance)||0) + Math.round((Number(form.lta)||0)/12) + (Number(form.medical)||0))}</span></div>
                    {inCalc.lwpDeduction > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">LWP ({form.unpaidLeaveDays} days)</span><span className="text-red-500 font-semibold">-{fmtINR(inCalc.lwpDeduction)}</span></div>}
                    <div className="flex justify-between text-xs"><span className="text-gray-500">Gross</span><span className="font-bold text-gray-800">{fmtINR(inCalc.gross)}</span></div>
                    {form.pfApplicable && <div className="flex justify-between text-xs"><span className="text-gray-500">PF ({form.pfRate||12}%)</span><span className="text-red-400">-{fmtINR(inCalc.pf)}</span></div>}
                    {inCalc.esi > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">ESI (0.75%)</span><span className="text-red-400">-{fmtINR(inCalc.esi)}</span></div>}
                    {inCalc.pt > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">Prof. Tax</span><span className="text-red-400">-{fmtINR(inCalc.pt)}</span></div>}
                    {inCalc.tds > 0 && <div className="flex justify-between text-xs"><span className="text-gray-500">TDS</span><span className="text-red-400">-{fmtINR(inCalc.tds)}</span></div>}
                    <div className="flex justify-between text-sm border-t border-[#1B2B5E]/10 pt-2 mt-1">
                      <span className="font-bold text-[#1B2B5E]">Net Take-Home</span>
                      <span className="font-black text-[#1B2B5E] text-base">{fmtINR(inCalc.net)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 font-semibold">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-[#1B2B5E] text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-[#2D4080] disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
            {saving ? 'Saving…' : existingProfile ? 'Save Changes' : 'Add to Payroll'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminPayrollPage() {
  const { currentUser } = useAuth();

  const [country, setCountry]       = useState<Country>('US');
  const [search, setSearch]         = useState('');
  const [users, setUsers]           = useState<ShipmateUser[]>([]);
  const [profiles, setProfiles]     = useState<Map<string, PayrollProfile>>(new Map());
  const [entries, setEntries]       = useState<Map<string, PayrollEntry>>(new Map());
  const [loading, setLoading]       = useState(true);
  const [editTarget, setEditTarget] = useState<ShipmateUser | null>(null);
  const [payslipTarget, setPayslipTarget] = useState<ShipmateUser | null>(null);

  // ── Firestore listeners ──
  useEffect(() => {
    const unsubUsers = onSnapshot(
      query(collection(db, 'users'), where('status', '==', 'active')),
      snap => {
        setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() } as ShipmateUser)));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubProfiles = onSnapshot(collection(db, 'payrollProfiles'), snap => {
      const m = new Map<string, PayrollProfile>();
      snap.docs.forEach(d => m.set(d.id, { uid: d.id, ...d.data() } as PayrollProfile));
      setProfiles(m);
    });

    const unsubEntries = onSnapshot(
      query(collection(db, 'payrollEntries'), where('month', '==', CURRENT_MONTH)),
      snap => {
        const m = new Map<string, PayrollEntry>();
        snap.docs.forEach(d => {
          const e = d.data() as PayrollEntry;
          m.set(e.uid, e);
        });
        setEntries(m);
      }
    );

    return () => { unsubUsers(); unsubProfiles(); unsubEntries(); };
  }, []);

  // ── Computed data ──
  const { countryEmps, unassigned, summaryCards } = useMemo(() => {
    const countryEmps: { user: ShipmateUser; profile: PayrollProfile; entry: PayrollEntry }[] = [];
    const unassigned: ShipmateUser[] = [];

    for (const user of users) {
      const profile = profiles.get(user.uid);
      if (!profile) { unassigned.push(user); continue; }
      if (profile.country !== country) continue;
      const entry = entries.get(user.uid) ?? {
        uid: user.uid, month: CURRENT_MONTH, country,
        otHours:0, otPay:0, adjustments:0,
        unpaidLeaveDays:0, paidLeaveDays:0,
        status:'Pending' as EmpStatus, notes:'',
      };
      countryEmps.push({ user, profile, entry });
    }

    // Summary
    let gross=0, net=0, tax=0, ot=0, otEmps=0, otHours=0, pf=0;
    for (const { profile, entry } of countryEmps) {
      if (country === 'US') {
        const c = calcUSPayroll(profile, entry);
        gross+=c.gross; net+=c.net; tax+=c.fedTax+c.stateTax;
        ot+=entry.otPay; if (entry.otPay>0) { otEmps++; otHours+=entry.otHours; }
      } else {
        const c = calcINPayroll(profile, entry);
        gross+=c.gross; net+=c.net; tax+=c.tds+c.pt; pf+=c.pf;
      }
    }

    return { countryEmps, unassigned, summaryCards: { gross, net, tax, ot, otEmps, otHours, pf } };
  }, [users, profiles, entries, country]);

  const filtered = countryEmps.filter(({ user }) =>
    [user.name, user.email, user.department].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const filteredUnassigned = unassigned.filter(u =>
    [u.name, u.email, u.department].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  // ── Export CSV ──────────────────────────────────────────────────────────────
  function downloadPayrollCSV() {
    let csv = '';
    if (country === 'US') {
      csv = [
        'Employee,Email,Department,State,Base Salary,OT Hours,OT Pay,Adjustments,Gross,Fed Tax,State Tax,SS,Medicare,SDI,401k,Health Ins,Total Deductions,Net Pay,Status',
        ...countryEmps.map(({ user, profile, entry }) => {
          const c = calcUSPayroll(profile, entry);
          return [
            `"${user.name}"`, user.email, user.department, profile.usState,
            profile.baseSalary, entry.otHours, entry.otPay, entry.adjustments,
            c.gross, c.fedTax, c.stateTax, c.ss, c.medicare, c.sdi,
            c.k401, c.healthIns, c.ded, c.net, entry.status,
          ].join(',');
        }),
      ].join('\n');
    } else {
      csv = [
        'Employee,Email,Department,State,Basic,HRA,Special Allowance,LTA/mo,Medical,OT Pay,Adjustments,Gross,PF,ESI,Prof Tax,TDS,Total Deductions,Net Pay,Status',
        ...countryEmps.map(({ user, profile, entry }) => {
          const c = calcINPayroll(profile, entry);
          return [
            `"${user.name}"`, user.email, user.department, profile.inState,
            profile.basic, profile.hra, profile.specialAllowance,
            Math.round(profile.lta / 12), profile.medical, entry.otPay, entry.adjustments,
            c.gross, c.pf, c.esi, c.pt, c.tds, c.ded, c.net, entry.status,
          ].join(',');
        }),
      ].join('\n');
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `payroll_${country}_${CURRENT_MONTH}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${country} payroll CSV downloaded`);
  }

  if (!currentUser) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Payroll · {MONTH_LABEL}</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Cycle closes Friday, 29 May ·{' '}
              {country === 'US' ? 'ADP export ready' : 'NEFT / IMPS via bank'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadPayrollCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Download size={14}/>
              {country === 'US' ? 'Export to ADP' : 'Export Sheet'}
            </button>
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-bold hover:bg-[#2D4080]">
              <TrendingUp size={14}/>
              Run Payroll
            </button>
          </div>
        </div>

        {/* ── Workflow Steps ── */}
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-4">
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { n:1, label:'Collect attendance', sub:'Done',        done:true,  current:false },
              { n:2, label:'Review variances',   sub:'In progress', done:false, current:true  },
              { n:3, label:'HR + Finance approval', sub:'Up next',  done:false, current:false },
              { n:4, label:'Disburse',           sub:'Up next',     done:false, current:false },
            ].map((s, i) => (
              <div key={s.n} className="flex items-center gap-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    s.done?'bg-green-500 text-white':s.current?'bg-[#1B2B5E] text-white':'bg-gray-100 text-gray-300'
                  }`}>{s.done?<CheckCircle2 size={14}/>:s.n}</div>
                  <div>
                    <p className={`text-xs font-semibold leading-tight ${s.done?'text-gray-500':s.current?'text-gray-900':'text-gray-300'}`}>{s.label}</p>
                    <p className={`text-[10px] ${s.current?'text-[#1B2B5E] font-bold':'text-gray-400'}`}>{s.sub}</p>
                  </div>
                </div>
                {i<3 && <ChevronRight size={14} className="text-gray-200 mx-1"/>}
              </div>
            ))}
          </div>
        </div>

        {/* ── Country Tabs ── */}
        <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-2xl p-1 w-fit">
          {(['US','IN'] as Country[]).map(c => (
            <button key={c} onClick={() => { setCountry(c); setSearch(''); }}
              className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                country===c?'bg-[#1B2B5E] text-white shadow-sm':'text-gray-400 hover:text-gray-700'
              }`}>
              <span className="text-base">{c==='US'?'🇺🇸':'🇮🇳'}</span>
              {c==='US'?'United States · USD':'India · INR'}
            </button>
          ))}
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#1B2B5E] rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">Gross Total</p>
            <p className="text-3xl font-black text-white leading-none">
              {country==='US' ? fmtUSDk(summaryCards.gross) : fmtINRk(summaryCards.gross)}
            </p>
            <p className="text-xs text-white/40 mt-1">{countryEmps.length} employees</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Net Payout</p>
            <p className="text-3xl font-black text-gray-900 leading-none">
              {country==='US' ? fmtUSDk(summaryCards.net) : fmtINRk(summaryCards.net)}
            </p>
            <p className="text-xs text-green-600 mt-1">after tax & deductions</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              {country==='US'?'Tax Withheld':'TDS + Prof. Tax'}
            </p>
            <p className="text-3xl font-black text-gray-900 leading-none">
              {country==='US' ? fmtUSDk(summaryCards.tax) : fmtINRk(summaryCards.tax)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{country==='US'?'Federal + state':'Income tax + PT'}</p>
          </div>
          {country==='US' ? (
            <div className="bg-[#F5C518] rounded-2xl p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B2B5E]/60 mb-1">Overtime</p>
              <p className="text-3xl font-black text-[#1B2B5E] leading-none">{fmtUSDk(summaryCards.ot)}</p>
              <p className="text-xs text-[#1B2B5E]/60 mt-1">{summaryCards.otEmps} employees · {summaryCards.otHours} hrs</p>
            </div>
          ) : (
            <div className="bg-[#F5C518] rounded-2xl p-5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#1B2B5E]/60 mb-1">PF Deducted</p>
              <p className="text-3xl font-black text-[#1B2B5E] leading-none">{fmtINRk(summaryCards.pf)}</p>
              <p className="text-xs text-[#1B2B5E]/60 mt-1">Employee contributions · EPFO</p>
            </div>
          )}
        </div>

        {/* ── Compliance Banner ── */}
        {country==='US' ? (
          <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <Building2 size={13} className="text-white"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-indigo-900">ADP Integration · Ready for Export</p>
              <p className="text-xs text-indigo-600 mt-0.5">FICA deposits due 15 June · 941 return due 31 July · State tax deposits vary</p>
            </div>
            <span className="text-xs font-bold text-indigo-700 border border-indigo-200 bg-white px-2.5 py-1 rounded-lg flex-shrink-0">Direct Deposit Ready</span>
          </div>
        ) : (
          <div className="bg-orange-50 border border-orange-100 rounded-2xl px-5 py-3 flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0">
              <Calculator size={13} className="text-white"/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-orange-900">New Tax Regime · FY 2026-27 (Income Tax Act 2025)</p>
              <p className="text-xs text-orange-700 mt-0.5">Std. deduction ₹75,000 · 87A rebate ≤ ₹12L · PF due 15 Jun · TDS due 7 Jun · 4 Labour Codes active</p>
            </div>
            <span className="text-xs font-bold text-orange-700 border border-orange-200 bg-white px-2.5 py-1 rounded-lg flex-shrink-0">EPFO / ESIC Compliant</span>
          </div>
        )}

        {/* ── Employee Table ── */}
        <div className="bg-white rounded-2xl border border-gray-100">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2 w-64">
              <Search size={14} className="text-gray-400 flex-shrink-0"/>
              <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search employee..."
                className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none flex-1"/>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">{filtered.length} configured · {filteredUnassigned.length} not set up</span>
            </div>
          </div>

          {loading ? (
            <div className="py-16 flex flex-col items-center gap-3">
              <Loader2 size={24} className="text-[#1B2B5E] animate-spin"/>
              <p className="text-sm text-gray-400">Loading employees…</p>
            </div>
          ) : (
            <>
              {/* Configured employees */}
              {filtered.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-50">
                        <th className="px-5 py-3">Employee</th>
                        {country==='US' ? (
                          <>
                            <th className="px-3 py-3 text-right">Gross</th>
                            <th className="px-3 py-3 text-right">OT</th>
                            <th className="px-3 py-3 text-right">Fed Tax</th>
                            <th className="px-3 py-3 text-right">FICA</th>
                            <th className="px-3 py-3 text-right">Deductions</th>
                            <th className="px-3 py-3 text-right">Net</th>
                          </>
                        ) : (
                          <>
                            <th className="px-3 py-3 text-right">Basic</th>
                            <th className="px-3 py-3 text-right">Gross</th>
                            <th className="px-3 py-3 text-right">PF</th>
                            <th className="px-3 py-3 text-right">TDS</th>
                            <th className="px-3 py-3 text-right">Deductions</th>
                            <th className="px-3 py-3 text-right">Net</th>
                          </>
                        )}
                        <th className="px-3 py-3">Status</th>
                        <th className="px-3 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(({ user, profile, entry }) => {
                        const initials = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                        if (country === 'US') {
                          const c = calcUSPayroll(profile, entry);
                          return (
                            <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/8 flex items-center justify-center text-xs font-bold text-[#1B2B5E] flex-shrink-0">{initials}</div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
                                    <p className="text-[11px] text-gray-400">{user.department} · {profile.usState}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3.5 text-right text-sm font-semibold text-gray-800">{fmtUSD(c.gross)}</td>
                              <td className="px-3 py-3.5 text-right text-sm font-semibold">
                                {entry.otPay>0 ? <span className="text-amber-500">{fmtUSD(entry.otPay)}</span> : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-3.5 text-right text-sm text-red-500">-{fmtUSD(c.fedTax)}</td>
                              <td className="px-3 py-3.5 text-right text-sm text-red-400">-{fmtUSD(c.ss+c.medicare)}</td>
                              <td className="px-3 py-3.5 text-right text-sm text-red-400">-{fmtUSD(c.ded)}</td>
                              <td className="px-3 py-3.5 text-right text-sm font-bold text-gray-900">{fmtUSD(c.net)}</td>
                              <td className="px-3 py-3.5"><StatusBadge status={entry.status}/></td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => setEditTarget(user)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors">
                                    <Edit2 size={13}/>
                                  </button>
                                  <button onClick={() => setPayslipTarget(user)}
                                    className="text-xs font-semibold text-[#1B2B5E] hover:text-[#2D4080] flex items-center gap-0.5">
                                    Payslip<ChevronRight size={12}/>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        } else {
                          const c = calcINPayroll(profile, entry);
                          return (
                            <tr key={user.uid} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-xs font-bold text-orange-600 flex-shrink-0">{initials}</div>
                                  <div>
                                    <p className="text-sm font-semibold text-gray-900 leading-tight">{user.name}</p>
                                    <p className="text-[11px] text-gray-400">{user.department} · {profile.inState}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-3 py-3.5 text-right text-sm font-semibold text-gray-800">{fmtINR(profile.basic)}</td>
                              <td className="px-3 py-3.5 text-right text-sm font-semibold text-gray-800">{fmtINR(c.gross)}</td>
                              <td className="px-3 py-3.5 text-right text-sm text-red-400">-{fmtINR(c.pf)}</td>
                              <td className="px-3 py-3.5 text-right text-sm">
                                {c.tds>0 ? <span className="text-red-400">-{fmtINR(c.tds)}</span> : <span className="text-green-500 font-semibold">₹0</span>}
                              </td>
                              <td className="px-3 py-3.5 text-right text-sm text-red-400">-{fmtINR(c.ded)}</td>
                              <td className="px-3 py-3.5 text-right text-sm font-bold text-gray-900">{fmtINR(c.net)}</td>
                              <td className="px-3 py-3.5"><StatusBadge status={entry.status}/></td>
                              <td className="px-3 py-3.5">
                                <div className="flex items-center justify-end gap-2">
                                  <button onClick={() => setEditTarget(user)}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors">
                                    <Edit2 size={13}/>
                                  </button>
                                  <button onClick={() => setPayslipTarget(user)}
                                    className="text-xs font-semibold text-[#1B2B5E] hover:text-[#2D4080] flex items-center gap-0.5">
                                    Payslip<ChevronRight size={12}/>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        }
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Unassigned employees */}
              {filteredUnassigned.length > 0 && (
                <div className={filtered.length > 0 ? 'border-t border-gray-100' : ''}>
                  <div className="px-5 py-3 bg-gray-50/60 flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Not configured for payroll</span>
                    <span className="text-[10px] bg-gray-200 text-gray-500 font-bold px-2 py-0.5 rounded-full">{filteredUnassigned.length}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {filteredUnassigned.map(user => {
                      const initials = user.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                      return (
                        <div key={user.uid} className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-400 flex-shrink-0">{initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-700">{user.name}</p>
                            <p className="text-[11px] text-gray-400">{user.email} · {user.department}</p>
                          </div>
                          <button onClick={() => setEditTarget(user)}
                            className="flex items-center gap-1.5 text-xs font-bold text-[#1B2B5E] bg-[#1B2B5E]/8 hover:bg-[#1B2B5E]/15 px-3 py-1.5 rounded-lg transition-colors">
                            <Plus size={12}/>
                            Add to {country === 'US' ? 'US' : 'India'} Payroll
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {filtered.length === 0 && filteredUnassigned.length === 0 && (
                <div className="py-14 text-center">
                  <p className="text-gray-300 text-4xl mb-2">💰</p>
                  <p className="text-sm font-semibold text-gray-400">No employees found</p>
                  <p className="text-xs text-gray-300 mt-1">Try a different search or check the other country tab</p>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/40 rounded-b-2xl flex items-center justify-between text-xs text-gray-400">
            {country==='US'
              ? <span>ADP Direct Deposit file ready after HR + Finance approval</span>
              : <span>NEFT / IMPS · PF & TDS via EPFO / TRACES portal</span>}
            <span className="font-semibold text-gray-700">
              {country==='US'
                ? `Gross ${fmtUSD(summaryCards.gross)} · Net ${fmtUSD(summaryCards.net)}`
                : `Gross ${fmtINR(summaryCards.gross)} · Net ${fmtINR(summaryCards.net)}`}
            </span>
          </div>
        </div>

        {/* ── Tax Reference Panels ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {country === 'US' ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-[#1B2B5E]/8 flex items-center justify-center"><FileText size={14} className="text-[#1B2B5E]"/></div>
                  <div><p className="text-sm font-bold text-gray-900">2026 Federal Tax Brackets</p>
                    <p className="text-[11px] text-gray-400">Single filer · Std. deduction $14,600</p></div>
                </div>
                {[['10%','Up to $11,600'],['12%','$11,601–$47,150'],['22%','$47,151–$100,525'],
                  ['24%','$100,526–$191,950'],['32%','$191,951–$243,725'],['35%','$243,726–$609,350'],['37%','Over $609,350']
                ].map(([r,rng]) => (
                  <div key={r} className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0 text-xs">
                    <span className="font-black text-[#1B2B5E] w-10">{r}</span>
                    <span className="text-gray-500">{rng}</span>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-[#1B2B5E]/8 flex items-center justify-center"><Building2 size={14} className="text-[#1B2B5E]"/></div>
                  <p className="text-sm font-bold text-gray-900">FICA & State Tax Reference</p>
                </div>
                {[{n:'Social Security',ee:'6.2%',er:'6.2%',note:'Wage base $168,600/yr · auto-capped in calculations'},
                  {n:'Medicare',ee:'1.45%',er:'1.45%',note:'+0.9% additional EE-only on wages >$200k/yr'},
                  {n:'FUTA',ee:'—',er:'~0.6% net',note:'First $7,000/yr per employee (ER only)'},
                  {n:'SDI / SUI',ee:'Varies',er:'Varies',note:'CA 1.1% · NJ 0.47% · NY 0.5% · HI 0.5% · RI 1.1%'},
                ].map(r => (
                  <div key={r.n} className="bg-gray-50 rounded-xl p-2.5 mb-2 last:mb-0">
                    <div className="flex justify-between text-xs"><span className="font-semibold text-gray-700">{r.n}</span>
                      <span className="text-gray-500">EE: <b>{r.ee}</b> · ER: <b>{r.er}</b></span></div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.note}</p>
                  </div>
                ))}
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mt-4 mb-2">State Income Tax (all 50 + DC)</p>
                <div className="grid grid-cols-6 gap-1">
                  {Object.entries(STATE_TAX).sort((a,b)=>a[0].localeCompare(b[0])).map(([s,r]) => (
                    <div key={s} className={`rounded-lg p-1.5 text-center ${r===0?'bg-green-50':'bg-gray-50'}`}>
                      <p className="text-[10px] font-black text-gray-700">{s}</p>
                      <p className={`text-[9px] ${r===0?'text-green-600 font-bold':'text-gray-400'}`}>{r===0?'None':`${(r*100).toFixed(1)}%`}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center"><FileText size={14} className="text-orange-600"/></div>
                  <div><p className="text-sm font-bold text-gray-900">New Tax Regime · FY 2026-27</p>
                    <p className="text-[11px] text-gray-400">Income Tax Act 2025, effective Apr 1 2026</p></div>
                </div>
                {[['0%','Up to ₹4,00,000'],['5%','₹4L–₹8L'],['10%','₹8L–₹12L'],
                  ['15%','₹12L–₹16L'],['20%','₹16L–₹20L'],['25%','₹20L–₹24L'],['30%','Above ₹24L']
                ].map(([r,rng]) => (
                  <div key={r} className="flex gap-3 py-1.5 border-b border-gray-50 last:border-0 text-xs">
                    <span className="font-black text-orange-600 w-10">{r}</span>
                    <span className="text-gray-500">{rng}</span>
                  </div>
                ))}
                <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t">Std. deduction ₹75,000 · +4% Cess · 87A rebate ≤ ₹12L taxable</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-orange-50 flex items-center justify-center"><Building2 size={14} className="text-orange-600"/></div>
                  <p className="text-sm font-bold text-gray-900">Statutory Contributions</p>
                </div>
                {[{n:'PF / EPF',ee:'12% of Basic',er:'12% of Basic',note:'EPFO deposit by 15th · ER: 8.33% EPS + 3.67% EPF'},
                  {n:'ESI (gross ≤ ₹21k)',ee:'0.75%',er:'3.25%',note:'ESIC deposit by 15th · medical, maternity cover'},
                  {n:'Professional Tax',ee:'Up to ₹200/mo',er:'Nil',note:'Nil in Delhi, Haryana, UP, Rajasthan, Punjab'},
                  {n:'Gratuity (after 5 yrs)',ee:'Nil',er:'4.81% of Basic',note:'Tax-free up to ₹20L'},
                ].map(r => (
                  <div key={r.n} className="bg-gray-50 rounded-xl p-2.5 mb-2 last:mb-0">
                    <div className="flex justify-between gap-2 text-xs">
                      <span className="font-semibold text-gray-700">{r.n}</span>
                      <span className="text-gray-500 text-right">EE: <b className="text-orange-600">{r.ee}</b> · ER: <b>{r.er}</b></span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">{r.note}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="h-4"/>
      </div>

      {/* ── Edit Modal ── */}
      {editTarget && (
        <EditPayrollModal
          user={editTarget}
          existingProfile={profiles.get(editTarget.uid)}
          existingEntry={entries.get(editTarget.uid)}
          defaultCountry={country}
          adminUid={currentUser.uid}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* ── Payslip Modals ── */}
      {payslipTarget && profiles.get(payslipTarget.uid)?.country === 'US' && (
        <USPayslipModal
          user={payslipTarget}
          profile={profiles.get(payslipTarget.uid)!}
          entry={entries.get(payslipTarget.uid) ?? {
            uid:payslipTarget.uid, month:CURRENT_MONTH, country:'US',
            otHours:0, otPay:0, adjustments:0, status:'Pending', notes:'',
          }}
          onClose={() => setPayslipTarget(null)}
        />
      )}
      {payslipTarget && profiles.get(payslipTarget.uid)?.country === 'IN' && (
        <INPayslipModal
          user={payslipTarget}
          profile={profiles.get(payslipTarget.uid)!}
          entry={entries.get(payslipTarget.uid) ?? {
            uid:payslipTarget.uid, month:CURRENT_MONTH, country:'IN',
            otHours:0, otPay:0, adjustments:0, status:'Pending', notes:'',
          }}
          onClose={() => setPayslipTarget(null)}
        />
      )}
    </div>
  );
}
