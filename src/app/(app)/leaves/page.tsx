'use client';

import { useState, useEffect } from 'react';
import { Plus, Calendar, ClipboardList, CheckSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Button, Card, CardHeader, CardTitle, Badge, LeaveStatusBadge, Avatar, EmptyState } from '@/components/ui';
import { leaveService } from '@/lib/services/leaveService';
import { getLeaveTypeLabel, formatDate } from '@/lib/utils/formatters';
import type { LeaveRequest, LeaveBalance } from '@/lib/types';

type Tab = 'my-leaves' | 'approvals' | 'calendar';

// ── Leave Balance Card ─────────────────────────────────────────────────────

function LeaveBalanceCard({ balance }: { balance: LeaveBalance | null }) {
  if (!balance) return null;

  const items = [
    { label: 'Casual',    used: balance.casual.used,  total: balance.casual.total,  color: 'bg-blue-500' },
    { label: 'Sick',      used: balance.sick.used,    total: balance.sick.total,    color: 'bg-red-400' },
    { label: 'WFH',       used: balance.wfh.used,     total: balance.wfh.total,     color: 'bg-emerald-500' },
  ];

  return (
    <Card className="mb-4">
      <CardHeader><CardTitle>Leave Balance {balance.year}</CardTitle></CardHeader>
      <div className="grid grid-cols-3 gap-3">
        {items.map(({ label, used, total, color }) => (
          <div key={label} className="text-center">
            <div className="text-xl font-bold text-gray-900">{total - used}</div>
            <div className="text-xs text-gray-500 mb-2">{label}</div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all`}
                style={{ width: `${Math.min(100, (used / total) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-gray-400 mt-1">{used}/{total} used</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Apply Leave Form (inline modal) ───────────────────────────────────────

function ApplyLeaveForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    type: 'casual' as const,
    startDate: '',
    endDate: '',
    reason: '',
  });

  const isHalfDay = form.type.startsWith('half-day');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setLoading(true);
    try {
      const duration = isHalfDay ? 0.5 : (() => {
        const start = new Date(form.startDate);
        const end = new Date(form.endDate || form.startDate);
        return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
      })();

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
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Apply Leave</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Leave type */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Leave Type</label>
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/20 focus:border-[#1B2B5E]"
            >
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="unpaid">Unpaid Leave</option>
              <option value="half-day-first">Half Day — First Half</option>
              <option value="half-day-second">Half Day — Second Half</option>
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
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/20 focus:border-[#1B2B5E]"
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
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/20 focus:border-[#1B2B5E]"
                />
              </div>
            )}
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Reason <span className="font-normal text-gray-400">(min 10 chars)</span>
            </label>
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder="Brief reason for your leave…"
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/20 focus:border-[#1B2B5E]"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" size="md" fullWidth onClick={onClose} type="button">
              Cancel
            </Button>
            <Button variant="primary" size="md" fullWidth loading={loading} type="submit">
              Submit Request
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Leave History List ─────────────────────────────────────────────────────

function LeaveHistoryList({ leaves, onCancel }: { leaves: LeaveRequest[]; onCancel: (id: string) => void }) {
  if (leaves.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={24} />}
        title="No leave requests yet"
        description="Your leave requests will appear here once you apply."
      />
    );
  }

  return (
    <div className="space-y-3">
      {leaves.map(leave => (
        <Card key={leave.id} padding="sm">
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
                {' · '}{leave.durationDays === 0.5 ? '0.5 day' : `${leave.durationDays} day${leave.durationDays !== 1 ? 's' : ''}`}
              </p>
              <p className="text-xs text-gray-400 mt-1 truncate">{leave.reason}</p>
              {leave.managerComment && (
                <p className="text-xs text-red-500 mt-1 italic">"{leave.managerComment}"</p>
              )}
            </div>
            {leave.status === 'pending' && (
              <button
                onClick={() => onCancel(leave.id)}
                className="text-xs text-red-500 hover:text-red-700 font-medium flex-shrink-0"
              >
                Cancel
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── HR Approval Panel ──────────────────────────────────────────────────────

function ApprovalPanel({ leaves, onRefresh }: { leaves: LeaveRequest[]; onRefresh: () => void }) {
  const { currentUser } = useAuth();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  async function approve(leave: LeaveRequest) {
    if (!currentUser) return;
    setLoading(leave.id);
    try {
      await leaveService.approveLeave(leave.id, currentUser.uid, currentUser.name);
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
      setRejectingId(null);
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
        title="No pending approvals"
        description="You're all caught up! 🎉"
      />
    );
  }

  return (
    <div className="space-y-3">
      {leaves.map(leave => (
        <Card key={leave.id}>
          <div className="flex items-start gap-3 mb-3">
            <Avatar name={leave.employeeName} src={leave.employeePhotoURL} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">{leave.employeeName}</p>
              <p className="text-xs text-gray-500">{leave.departmentId} · {getLeaveTypeLabel(leave.type)}</p>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 mb-3 text-xs text-gray-600 space-y-1">
            <div><span className="font-medium">Dates:</span> {formatDate(leave.startDate)} – {formatDate(leave.endDate)} ({leave.durationDays}d)</div>
            <div><span className="font-medium">Reason:</span> {leave.reason}</div>
          </div>

          {rejectingId === leave.id ? (
            <div className="space-y-2">
              <textarea
                rows={2}
                placeholder="Rejection reason (required)…"
                value={comment}
                onChange={e => setComment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:border-red-400"
              />
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setRejectingId(null); setComment(''); }}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={loading === leave.id}
                  disabled={!comment.trim()}
                  onClick={() => reject(leave)}
                >
                  Confirm Reject
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="success" size="sm" loading={loading === leave.id} onClick={() => approve(leave)} fullWidth>
                ✓ Approve
              </Button>
              <Button variant="danger" size="sm" onClick={() => setRejectingId(leave.id)} fullWidth>
                ✗ Reject
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function LeavesPage() {
  const { currentUser } = useAuth();
  const { can } = useRole();

  const [tab, setTab] = useState<Tab>('my-leaves');
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

  useEffect(() => { loadData(); }, [currentUser?.uid]);

  async function handleCancel(id: string) {
    await leaveService.cancelLeave(id);
    loadData();
  }

  const tabs: { key: Tab; label: string; icon: typeof Calendar; adminOnly?: boolean }[] = [
    { key: 'my-leaves', label: 'My Leaves', icon: ClipboardList },
    { key: 'approvals', label: `Approvals${pendingLeaves.length > 0 ? ` (${pendingLeaves.length})` : ''}`, icon: CheckSquare, adminOnly: true },
  ];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-gray-900">Leaves</h1>
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

      {/* Tabs — show approvals tab only to managers+ */}
      {can.approveLeaves && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          {tabs.filter(t => !t.adminOnly || can.approveLeaves).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-white text-[#1B2B5E] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-2xl shimmer" />)}
        </div>
      ) : tab === 'my-leaves' ? (
        <LeaveHistoryList leaves={myLeaves} onCancel={handleCancel} />
      ) : tab === 'approvals' ? (
        <ApprovalPanel leaves={pendingLeaves} onRefresh={loadData} />
      ) : null}

      {/* Apply form modal */}
      {showApplyForm && (
        <ApplyLeaveForm
          onClose={() => setShowApplyForm(false)}
          onSuccess={() => { setShowApplyForm(false); loadData(); }}
        />
      )}
    </div>
  );
}
