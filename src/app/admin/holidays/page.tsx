'use client';

import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, CalendarDays, X, Globe, Building2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { holidayService, type Holiday } from '@/lib/services/holidayService';
import { announcementService } from '@/lib/services/announcementService';
import toast from 'react-hot-toast';

// ── Helpers ───────────────────────────────────────────────────────────────────

const REGION_OPTIONS = ['IN', 'US', 'SG', 'UK', 'CA', 'AU', 'NG', 'AE', 'DE', 'FR'];

function formatDisplayDate(dateStr: string) {
  // dateStr is YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return {
    dayNum: d.toLocaleDateString('en-US', { day: '2-digit' }),
    month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
    weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
  };
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function HolidayModal({
  editing,
  onClose,
  onSaved,
  currentUser,
}: {
  editing: Holiday | null;
  onClose: () => void;
  onSaved: () => void;
  currentUser: { uid: string; name: string };
}) {
  const [name, setName] = useState(editing?.name ?? '');
  const [date, setDate] = useState(editing?.date ?? '');
  const [type, setType] = useState<'company' | 'regional'>(editing?.type ?? 'company');
  const [regions, setRegions] = useState<string[]>(editing?.regions ?? []);
  const [saving, setSaving] = useState(false);

  function toggleRegion(r: string) {
    setRegions(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  }

  async function save() {
    if (!name.trim() || !date) { toast.error('Name and date are required'); return; }
    if (regions.length === 0) { toast.error('Select at least one region'); return; }
    setSaving(true);
    try {
      const payload = { name: name.trim(), date, type, regions, createdBy: currentUser.uid, createdByName: currentUser.name };
      if (editing?.id) {
        await holidayService.updateHoliday(editing.id, payload);
        toast.success('Holiday updated');
      } else {
        await holidayService.createHoliday(payload);

        // Auto-post an announcement so employees see it on their dashboard + notification bell
        const [y, m, d] = date.split('-').map(Number);
        const displayDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
        });
        const regionLabel = type === 'company' ? 'Company-wide' : `Regional (${regions.join(', ')})`;
        await announcementService.createAnnouncement({
          title: `🎉 Holiday: ${name.trim()}`,
          body: `${name.trim()} is on ${displayDate}.\n\n${regionLabel} — Offices will be closed. Enjoy your day off! 🏖️`,
          authorId: currentUser.uid,
          authorName: currentUser.name,
          isPinned: true,
        });

        toast.success('Holiday added & announcement posted!');
      }
      onSaved();
      onClose();
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-[#1B2B5E] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[#F5C518]" />
            <h2 className="text-white font-bold text-sm">{editing ? 'Edit Holiday' : 'Add Holiday'}</h2>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Holiday Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Independence Day"
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType('company')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  type === 'company'
                    ? 'bg-[#1B2B5E] border-[#1B2B5E] text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Building2 size={14} /> Company-wide
              </button>
              <button
                onClick={() => setType('regional')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-semibold transition-all ${
                  type === 'regional'
                    ? 'bg-[#1B2B5E] border-[#1B2B5E] text-white'
                    : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <Globe size={14} /> Regional
              </button>
            </div>
          </div>

          {/* Regions */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Regions</label>
            <div className="flex flex-wrap gap-1.5">
              {REGION_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => toggleRegion(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                    regions.includes(r)
                      ? 'bg-[#1B2B5E] border-[#1B2B5E] text-white'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : '+ Add Holiday'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminHolidaysPage() {
  const { currentUser } = useAuth();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);

  async function load() {
    setLoading(true);
    try { setHolidays(await holidayService.getHolidays()); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this holiday?')) return;
    await holidayService.deleteHoliday(id);
    setHolidays(prev => prev.filter(h => h.id !== id));
    toast.success('Deleted');
  }

  function openAdd() { setEditing(null); setShowModal(true); }
  function openEdit(h: Holiday) { setEditing(h); setShowModal(true); }

  // Group by month
  const grouped = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const [year, month] = h.date.split('-');
    const key = `${year}-${month}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h);
    return acc;
  }, {});

  function monthLabel(key: string) {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  if (!currentUser) return null;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-6 pb-12">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Holidays</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {new Date().getFullYear()} calendar · regional &amp; company-wide
            </p>
          </div>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1B2B5E] text-white rounded-xl text-sm font-semibold hover:bg-[#2D4080] transition-colors shadow-sm"
          >
            <Plus size={16} />
            Add holiday
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-xl shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded shimmer" />
                    <div className="h-3 w-24 rounded shimmer" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : holidays.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
            <CalendarDays size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-semibold">No holidays added yet</p>
            <p className="text-gray-400 text-sm mt-1">Click "Add holiday" to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([key, items]) => (
              <div key={key}>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">{monthLabel(key)}</p>
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {/* Table header — hidden on mobile, shown md+ */}
                  <div className="hidden md:grid grid-cols-[130px_1fr_180px_120px_72px] gap-4 px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Holiday</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Regions</span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Type</span>
                    <span />
                  </div>

                  {items.map(h => {
                    const { dayNum, month, weekday } = formatDisplayDate(h.date);
                    const isCompany = h.type === 'company';
                    return (
                      <div key={h.id} className="px-4 md:px-5 py-3.5 md:py-4 hover:bg-gray-50/50 transition-colors">

                        {/* ── Mobile layout (stacked) ── */}
                        <div className="flex items-center gap-3 md:hidden">
                          <div className="w-11 h-11 bg-[#1B2B5E] rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                            <span className="text-white font-black text-sm leading-none">{dayNum}</span>
                            <span className="text-[#F5C518] text-[8px] font-bold tracking-widest leading-none mt-0.5">{month}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{h.name}</p>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isCompany ? 'bg-[#1B2B5E] text-white' : 'bg-gray-100 text-gray-600'}`}>
                                {isCompany ? 'Company' : 'Regional'}
                              </span>
                              {h.regions.slice(0, 3).map(r => (
                                <span key={r} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                              ))}
                              {h.regions.length > 3 && (
                                <span className="text-[10px] text-gray-400">+{h.regions.length - 3}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(h)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-[#1B2B5E]/5 hover:text-[#1B2B5E] transition-colors">
                              <Pencil size={14} />
                            </button>
                            <button onClick={() => handleDelete(h.id!)} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* ── Desktop layout (grid) ── */}
                        <div className="hidden md:grid grid-cols-[130px_1fr_180px_120px_72px] gap-4 items-center">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-[#1B2B5E] rounded-xl flex flex-col items-center justify-center flex-shrink-0">
                              <span className="text-white font-black text-base leading-none">{dayNum}</span>
                              <span className="text-[#F5C518] text-[9px] font-bold tracking-widest leading-none mt-0.5">{month}</span>
                            </div>
                            <span className="text-xs text-gray-400 hidden lg:block">{weekday}</span>
                          </div>
                          <span className="text-sm font-bold text-gray-900">{h.name}</span>
                          <div className="flex flex-wrap gap-1">
                            {h.regions.map(r => (
                              <span key={r} className="text-[10px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                            ))}
                          </div>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full w-fit ${isCompany ? 'bg-[#1B2B5E] text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {isCompany ? 'Company' : 'Regional'}
                          </span>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(h)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1B2B5E] font-semibold transition-colors px-1 py-1">
                              <Pencil size={13} />
                              Edit
                            </button>
                            <button onClick={() => handleDelete(h.id!)} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && currentUser && (
        <HolidayModal
          editing={editing}
          onClose={() => setShowModal(false)}
          onSaved={load}
          currentUser={{ uid: currentUser.uid, name: currentUser.name }}
        />
      )}
    </div>
  );
}
