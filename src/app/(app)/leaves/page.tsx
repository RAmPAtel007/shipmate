'use client';

import { useState, useEffect } from 'react';
import {
  Plus, Calendar, ClipboardList, CheckSquare,
  CheckCircle2, XCircle, Clock, X, ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Button, LeaveStatusBadge, Avatar, EmptyState } from '@/components/ui';
import { leaveService } from '@/lib/services/leaveService';
import { getLeaveTypeLabel, formatDate } from '@/lib/utils/formatters';
import type { LeaveRequest, LeaveBalance } from '@/lib/types';

// ── Leave Balance Card ─────────────────────────────────────────────────────

function LeaveBalanceCard({ balance }: { balance: LeaveBalance | null }) {
  if (!balance) return null;

  const items = [
    {
      label: 'Casual',
      used: balance.casual.used,
      total: balance.casual.total,
      color: 'bg-[#1B2B5E]',
      lightColor: 'bg-[#1B2B5E]/8',
      textColor: 'text-[#1B2B5E]',
    },
    {
      label: 'Sick',
      used: balance.sick.used,
      total: balance.sick.total,
      color: 'bg-rose-500',
      lightColor: 'bg-rose-50',
      textColor: 'text-rose-600',
    },
    {
      label: 'WFH',
      used: balance.wfh.used,
      total: balance.wfh.total,
      color: 'bg-emerald-500',
      lightColor: 'bg-emerald-50',
      textColor: 'text-emerald-600',
    },
  ];

  return (
    <div className="border border-gray-100 rounded-xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Leave Balance</h3>
        <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{balance.year}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, used, total, color, lightColor, textColor }) => {
          const remaining = total - used;
          const pct = Math.min(100, (used / total) * 100);
          return (
            <div key={label} className={`${lightColor} rounded-xl p-3`}>
              <div className={`text-2xl font-bold ${textColor}`}>{remaining}</div>
              <div className="text-xs font-semibold text-gray-500 mt-0.5 mb-2">{label}</div>
              <div className="h-1 bg-black/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} rounded-full transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-[10px] text-gray-400 mt-1.5">{used} of {total} used</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Apply Leave Form ───────────────────────────────────────────────────────

function ApplyLeaveForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    type: 'casual' as const,
    startDate: '',
    endDate: '',
    reason: '',
  });

  const isHalfDay = form.type.startsWith('half-day');

  // Calculate duration for display
  const duration = isHalfDay ? 0.5 : (() => {
    if (!form.startDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate || form.startDate);
    if (end < start) return 0;
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!currentUser) return;
    if (!isHalfDay && form.endDate && form.endDate < form.startDate) {
      setError('"To" date cannot be before "From" date.');
      return;
    }
    if (!form.reason.trim()) {
      setError('Please provide a reason for your leave.');
      return;
    }
    setLoading(true);
    try {
      await leaveService.applyLeave({
        employeeId: currentUser.uid,
        employeeName: currentUser.name,
        employeePhotoURL: currentUser.photoURL,
        departmentId: currentUser.department,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate || form.startDate,
        durationDays: duration,
        reason: form.reason,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message ?? 'Failed to submit leave request.');
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/20 focus:border-[#1B2B5E] bg-white';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-modal overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Apply for Leave</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 text-xs px-3 py-2.5 rounded-lg border border-red-100">
              <XCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Leave type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Leave Type</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
              className={inputCls}
            >
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="unpaid">Unpaid Leave</option>
              <option value="half-day-first">Half Day — Morning</option>
              <option value="half-day-second">Half Day — Afternoon</option>
              <option value="wfh">Work From Home</option>
            </select>
          </div>

          {/* Dates */}
          <div className={`grid ${isHalfDay ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {isHalfDay ? 'Date' : 'From'}
              </label>
              <input
                type="date"
                required
                value={form.startDate}
                onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                className={inputCls}
              />
            </div>
            {!isHalfDay && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">To</label>
                <input
                  type="date"
                  value={form.endDate}
                  min={form.startDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className={inputCls}
                />
              </div>
            )}
          </div>

          {/* Duration preview */}
          {duration > 0 && (
            <div className="flex items-center gap-2 text-xs text-[#1B2B5E] bg-[#1B2B5E]/5 px-3 py-2 rounded-lg">
              <Clock size={13} />
              <span className="font-semibold">{duration === 0.5 ? 'Half day' : `${duration} day${duration !== 1 ? 's' : ''}`}</span>
              <span className="text-[#1B2B5E]/60">will be deducted from your balance</span>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1.5">Reason</label>
            <textarea
              required
              rows={3}
              placeholder="Brief reason for your leave…"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className={`${inputCls} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" size="md" fullWidth onClick={onClose} type="button">Cancel</Button>
            <Button variant="primary" size="md" fullWidth loading={loading} type="submit"
              disabled={!form.startDate || !form.reason.trim()}
            >
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leave History ──────────────────────────────────────────────────────────

function LeaveHistoryList({ leaves, onCancel }: { leaves: LeaveRequest[]; onCancel: (id: string) => void }) {
  const [canceling, setCanceling] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCanceling(id);
    try { await onCancel(id); } finally { setCanceling(null); }
  }

  if (leaves.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={24} />}
        title="No leave requests yet"
        description="Your leave history will appear here once you submit a request."
      />
    );
  }

  return (
    <div className="space-y-2">
      {leaves.map(leave => (
        <div
          key={leave.id}
          className="border border-gray-100 rounded-xl p-4 bg-white hover:border-gray-200 transition-colors"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-sm font-semibold text-gray-900">
                  {getLeaveTypeLabel(leave.type)}
                </span>
                <LeaveStatusBadge status={leave.status} />
              </div>

              <p className="text-xs text-gray-500">
                {leave.startDate === leave.endDate
                  ? formatDate(leave.startDate)
                  : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`}
                <span className="mx-1 text-gray-300">·</span>
                {leave.durationDays === 0.5 ? 'Half day' : `${leave.durationDays} day${leave.durationDays !== 1 ? 's' : ''}`}
              </p>

              {leave.reason && (
                <p className="text-xs text-gray-400 mt-1 line-clamp-2">{leave.reason}</p>
              )}

              {/* Admin response */}
              {leave.adminMessage && (
                <div className={`mt-2.5 flex items-start gap-2 px-3 py-2 rounded-lg text-xs border ${
                  leave.status === 'approved'
                    ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    : 'bg-red-50 border-red-100 text-red-600'
                }`}>
                  {leave.status === 'approved'
                    ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                    : <XCircle size={13} className="flex-shrink-0 mt-0.5" />
                  }
                  <span><span className="font-semibold">Admin: </span>{leave.adminMessage}</span>
                </div>
              )}
            </div>

            {leave.status === 'pending' && (
              <button
                onClick={() => handleCancel(leave.id)}
                disabled={canceling === leave.id}
                className="text-xs text-red-400 hover:text-red-600 font-medium flex-shrink-0 disabled:opacity-50 border border-red-100 hover:border-red-200 px-2.5 py-1 rounded-lg transition-colors"
              >
                {canceling === leave.id ? 'Canceling…' : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── HR Approval Panel ──────────────────────────────────────────────────────

function ApprovalPanel({ leaves, onRefresh }: { leaves: LeaveRequest[]; onRefresh: () => void }) {
  const { currentUser } = useAuth();
  const [activeId, setActiveId] = useState<{ id: string; mode: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  async function approve(leave: LeaveRequest) {
    if (!currentUser) return;
    setLoading(leave.id);
    try {
      await leaveService.approveLeave(leave.id, currentUser.uid, currentUser.name, comment.trim() || undefined);
      setActiveId(null);
      setComment('');
      onRefresh();
    } finally {
      setLoading(null);
    }
  }

  async function reject(leave: LeaveRequest) {
    if (!currentUser || !comment.trim()) return;
    setLoading(leave.id);
    try {
      await leaveService.rejectLeave(leave.id, currentUser.uid, currentUser.name, comment);
      setActiveId(null);
      setComment('');
      onRefresh();
    } finally {
      setLoading(null);
    }
  }

  if (leaves.length === 0) {
    return (
      <EmptyState
        icon={<CheckSquare size={24} />}
        title="All caught up!"
        description="No pending leave requests to review."
      />
    );
  }

  return (
    <div className="space-y-3">
      {leaves.map(leave => {
        const isActive = activeId?.id === leave.id;
        return (
          <div key={leave.id} className="border border-gray-100 rounded-xl overflow-hidden bg-white">
            {/* Employee info */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-50">
              <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="md" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm">{leave.employeeName}</p>
                <p className="text-xs text-gray-400 capitalize">
                  {leave.departmentId.replace('-', ' ')}
                  <span className="mx-1">·</span>
                  {getLeaveTypeLabel(leave.type)}
                </p>
              </div>
              <LeaveStatusBadge status={leave.status} />
            </div>

            {/* Leave details */}
            <div className="px-4 py-3 bg-gray-50 text-xs text-gray-600 space-y-1.5">
              <div className="flex items-center gap-2">
                <Calendar size={12} className="text-gray-400" />
                <span>
                  {formatDate(leave.startDate)}
                  {leave.startDate !== leave.endDate && ` – ${formatDate(leave.endDate)}`}
                  <span className="ml-1 text-gray-400">({leave.durationDays}d)</span>
                </span>
              </div>
              <div className="flex items-start gap-2">
                <ClipboardList size={12} className="text-gray-400 mt-0.5 flex-shrink-0" />
                <span className="line-clamp-2">{leave.reason}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4">
              {isActive ? (
                <div className="space-y-2.5">
                  <div className={`text-xs font-semibold px-1 ${
                    activeId.mode === 'approve' ? 'text-emerald-700' : 'text-red-600'
                  }`}>
                    {activeId.mode === 'approve' ? 'Message to employee (optional)' : 'Rejection reason (required)'}
                  </div>
                  <textarea
                    rows={2}
                    placeholder={activeId.mode === 'approve'
                      ? 'e.g. Approved! Enjoy your time off.'
                      : 'e.g. Team coverage needed on those dates.'}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-sm resize-none focus:outline-none ${
                      activeId.mode === 'approve'
                        ? 'border-emerald-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100'
                        : 'border-red-200 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    }`}
                  />
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setActiveId(null); setComment(''); }}>
                      Back
                    </Button>
                    {activeId.mode === 'approve' ? (
                      <Button
                        variant="success"
                        size="sm"
                        loading={loading === leave.id}
                        onClick={() => approve(leave)}
                      >
                        Confirm Approve
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={loading === leave.id}
                        disabled={!comment.trim()}
                        onClick={() => reject(leave)}
                      >
                        Confirm Reject
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setActiveId({ id: leave.id, mode: 'approve' }); setComment(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100"
                  >
                    <CheckCircle2 size={14} />
                    Approve
                  </button>
                  <button
                    onClick={() => { setActiveId({ id: leave.id, mode: 'reject' }); setComment(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors border border-red-100"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function LeavesPage() {
  const { currentUser } = useAuth();
  const { can } = useRole();

  const [tab, setTab] = useState<'my-leaves' | 'approvals'>('my-leaves');
  const [myLeaves, setMyLeaves] = useState<LeaveRequest[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [leaves, bal] = await Promise.all([
        leaveService.getMyLeaves(currentUser.uid),
        leaveService.getOrCreateLeaveBalance(currentUser.uid),
      ]);
      setMyLeaves(leaves);
      setBalance(bal);
      if (can.approveLeaves) {
        const pending = await leaveService.getPendingLeaves();
        setPendingLeaves(pending);
      }
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [currentUser?.uid]);

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Leaves</h1>
            {balance && (
              <p className="text-xs text-gray-400 mt-0.5">
                {balance.casual.total - balance.casual.used + balance.sick.total - balance.sick.used} days remaining this year
              </p>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus size={15} />}
            onClick={() => setShowApplyForm(true)}
          >
            Apply Leave
          </Button>
        </div>

        {/* Balance */}
        <LeaveBalanceCard balance={balance} />

        {/* Tabs — only shown to managers+ */}
        {can.approveLeaves && (
          <div className="flex gap-1 bg-gray-50 border border-gray-100 rounded-xl p-1 mb-4">
            {([
              { key: 'my-leaves' as const, label: 'My Leaves', icon: ClipboardList },
              {
                key: 'approvals' as const,
                label: 'Approvals',
                icon: CheckSquare,
                count: pendingLeaves.length,
              },
            ]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  tab === t.key
                    ? 'bg-white text-[#1B2B5E] shadow-sm border border-gray-100'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <t.icon size={14} />
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span className="bg-[#F5C518] text-[#1B2B5E] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 rounded-xl border border-gray-100 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : tab === 'my-leaves' ? (
          <LeaveHistoryList leaves={myLeaves} onCancel={async (id) => { await leaveService.cancelLeave(id); loadData(); }} />
        ) : (
          <ApprovalPanel leaves={pendingLeaves} onRefresh={loadData} />
        )}
      </div>

      {showApplyForm && (
        <ApplyLeaveForm
          onClose={() => setShowApplyForm(false)}
          onSuccess={() => { setShowApplyForm(false); loadData(); }}
        />
      )}
    </div>
  );
}
