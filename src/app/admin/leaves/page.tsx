'use client';

import { useEffect, useState } from 'react';
import { Search, X, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { leaveService } from '@/lib/services/leaveService';
import { formatDate, getLeaveTypeLabel } from '@/lib/utils/formatters';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import type { LeaveRequest, LeaveStatus } from '@/lib/types';

const STATUS_FILTER: { label: string; value: LeaveStatus | 'all' }[] = [
  { label: 'All',       value: 'all' },
  { label: 'Pending',   value: 'pending' },
  { label: 'Approved',  value: 'approved' },
  { label: 'Rejected',  value: 'rejected' },
  { label: 'Cancelled', value: 'cancelled' },
];

const statusStyle: Record<string, string> = {
  pending:   'bg-amber-100 text-amber-700',
  approved:  'bg-emerald-100 text-emerald-700',
  rejected:  'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

type ActionMode = { type: 'approve' | 'reject'; leaveId: string } | null;

export default function AdminLeavesPage() {
  const { currentUser } = useAuth();
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('pending');
  const [actioning, setActioning] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode>(null);
  const [comment, setComment] = useState('');

  async function load() {
    setLoading(true);
    try {
      // ✅ Correct collection: leaveRequests (matches leaveService)
      const snap = await getDocs(query(collection(db, 'leaveRequests'), orderBy('createdAt', 'desc')));
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeaveRequest)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = leaves.filter(l => {
    const matchSearch = !search || l.employeeName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  async function approve(leave: LeaveRequest) {
    if (!currentUser) return;
    setActioning(leave.id);
    try {
      await leaveService.approveLeave(leave.id, currentUser.uid, currentUser.name, comment.trim() || undefined);
      toast.success(`✅ Approved ${leave.employeeName}'s leave`);
      setActionMode(null);
      setComment('');
      load();
    } catch { toast.error('Failed to approve'); }
    finally { setActioning(null); }
  }

  async function reject(leave: LeaveRequest) {
    if (!currentUser || !comment.trim()) return;
    setActioning(leave.id);
    try {
      await leaveService.rejectLeave(leave.id, currentUser.uid, currentUser.name, comment.trim());
      toast.success('Leave rejected');
      setActionMode(null);
      setComment('');
      load();
    } catch { toast.error('Failed to reject'); }
    finally { setActioning(null); }
  }

  const pending = leaves.filter(l => l.status === 'pending').length;

  return (
    <div className="p-8 max-w-7xl mx-auto h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Requests</h1>
          <p className="text-gray-500 mt-1">
            {leaves.length} total ·{' '}
            <span className="text-amber-600 font-semibold">{pending} pending</span>
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by employee name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                statusFilter === s.value
                  ? 'bg-[#1B2B5E] text-white border-[#1B2B5E]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#1B2B5E]/30'
              }`}
            >
              {s.label}
              {s.value === 'pending' && pending > 0 && (
                <span className="ml-1.5 bg-amber-400 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {pending}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Employee</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Dates</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
              <th className="text-left px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">Reason / Response</th>
              <th className="px-6 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-6 py-4"><div className="h-4 rounded shimmer" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-16 text-center">
                  <p className="text-gray-400 text-sm font-medium">
                    {statusFilter === 'pending' ? 'No pending leave requests 🎉' : 'No leave requests found'}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map(leave => (
                <>
                  <tr key={leave.id} className="hover:bg-gray-50/60 transition-colors">
                    {/* Employee */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-[#1B2B5E] text-xs font-bold">
                            {leave.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{leave.employeeName}</p>
                          <p className="text-xs text-gray-400">{leave.departmentId}</p>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-700 capitalize">{getLeaveTypeLabel(leave.type)}</span>
                      <p className="text-xs text-gray-400">{leave.durationDays}d</p>
                    </td>

                    {/* Dates */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">{formatDate(leave.startDate)}</p>
                      {leave.endDate !== leave.startDate && (
                        <p className="text-xs text-gray-400">→ {formatDate(leave.endDate)}</p>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${statusStyle[leave.status]}`}>
                        {leave.status}
                      </span>
                      {leave.approverName && (
                        <p className="text-[10px] text-gray-400 mt-1">by {leave.approverName}</p>
                      )}
                    </td>

                    {/* Reason / Response */}
                    <td className="px-6 py-4 max-w-[220px]">
                      <p className="text-sm text-gray-500 truncate">{leave.reason}</p>
                      {leave.adminMessage && (
                        <div className="flex items-start gap-1 mt-1">
                          <MessageSquare size={10} className={`flex-shrink-0 mt-0.5 ${leave.status === 'approved' ? 'text-emerald-500' : 'text-red-400'}`} />
                          <p className={`text-xs italic truncate ${leave.status === 'approved' ? 'text-emerald-600' : 'text-red-500'}`}>
                            &ldquo;{leave.adminMessage}&rdquo;
                          </p>
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4">
                      {leave.status === 'pending' && (
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => { setActionMode({ type: 'approve', leaveId: leave.id }); setComment(''); }}
                            disabled={!!actioning}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <CheckCircle2 size={13} />
                            Approve
                          </button>
                          <button
                            onClick={() => { setActionMode({ type: 'reject', leaveId: leave.id }); setComment(''); }}
                            disabled={!!actioning}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            <XCircle size={13} />
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {/* Inline action panel */}
                  {actionMode?.leaveId === leave.id && (
                    <tr key={`${leave.id}-action`}>
                      <td colSpan={6} className={`px-6 py-4 border-b ${actionMode.type === 'approve' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-gray-600 mb-1.5">
                              {actionMode.type === 'approve'
                                ? '✅ Add a message for the employee (optional)'
                                : '❌ Rejection reason — employee will see this (required)'}
                            </p>
                            <textarea
                              rows={2}
                              placeholder={actionMode.type === 'approve'
                                ? 'e.g. Approved! Enjoy your time off. 🌴'
                                : 'e.g. We need full team coverage on those dates.'}
                              value={comment}
                              autoFocus
                              onChange={e => setComment(e.target.value)}
                              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none resize-none ${
                                actionMode.type === 'approve'
                                  ? 'border-emerald-200 focus:border-emerald-400 bg-white'
                                  : 'border-red-200 focus:border-red-400 bg-white'
                              }`}
                            />
                          </div>
                          <div className="flex flex-col gap-2 flex-shrink-0 pt-5">
                            <button
                              onClick={() => actionMode.type === 'approve' ? approve(leave) : reject(leave)}
                              disabled={
                                actioning === leave.id ||
                                (actionMode.type === 'reject' && !comment.trim())
                              }
                              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
                                actionMode.type === 'approve'
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                  : 'bg-red-600 hover:bg-red-700 text-white'
                              }`}
                            >
                              {actioning === leave.id ? 'Saving…' : actionMode.type === 'approve' ? 'Confirm Approve' : 'Confirm Reject'}
                            </button>
                            <button
                              onClick={() => { setActionMode(null); setComment(''); }}
                              className="px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-semibold hover:bg-gray-50 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
