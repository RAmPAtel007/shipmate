'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Folder, Download, Trash2, Search, X,
  MoreVertical, Plus, FolderPlus,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { storageService } from '@/lib/services/storageService';
import { formatFileSize } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, serverTimestamp, onSnapshot, Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateDocument, DocumentFolder } from '@/lib/types';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FolderConfig {
  id: string;
  label: string;
  allowedRoles: string[];
  restricted?: boolean;
  isDynamic?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIXED_FOLDERS: FolderConfig[] = [
  { id: 'general',  label: 'General',       allowedRoles: ['super_admin','hr_admin','manager','employee'] },
  { id: 'finance',  label: 'Finance',       allowedRoles: ['super_admin','hr_admin'], restricted: true },
  { id: 'hr',       label: 'HR',            allowedRoles: ['super_admin','hr_admin'], restricted: true },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getExtLabel(name: string, type: string): string {
  const ext = name.split('.').pop()?.toUpperCase() ?? '';
  if (ext.length <= 5) return ext;
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('image/')) return type.split('/')[1]?.toUpperCase() ?? 'IMG';
  return 'FILE';
}

function getExtStyle(type: string): { bg: string; text: string } {
  if (type === 'application/pdf') return { bg: 'bg-red-500',   text: 'text-white' };
  if (type.startsWith('image/'))  return { bg: 'bg-orange-400',text: 'text-white' };
  if (type.includes('word') || type.includes('wordprocessingml')) return { bg: 'bg-blue-500', text: 'text-white' };
  if (type.includes('sheet') || type.includes('excel') || type.includes('spreadsheetml')) return { bg: 'bg-green-500', text: 'text-white' };
  if (type.includes('presentation') || type.includes('powerpoint')) return { bg: 'bg-orange-500', text: 'text-white' };
  return { bg: 'bg-gray-500', text: 'text-white' };
}

function timeAgo(ts: any): string {
  if (!ts) return '';
  const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : Date.now());
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ── Document Card ─────────────────────────────────────────────────────────────

function DocumentCard({
  doc: d,
  canDelete,
  onDelete,
}: {
  doc: ShipmateDocument;
  canDelete: boolean;
  onDelete: (id: string, storagePath: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ext = getExtLabel(d.name, d.fileType ?? '');
  const { bg, text } = getExtStyle(d.fileType ?? '');

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow relative group">
      {/* Top row: badge + menu */}
      <div className="flex items-start justify-between">
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-bold tracking-wide ${bg} ${text}`}>
          {ext}
        </span>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]">
              <a
                href={d.downloadURL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download size={13} /> Download
              </a>
              {canDelete && (
                <button
                  onClick={() => { setMenuOpen(false); onDelete(d.id!, d.storagePath ?? ''); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                >
                  <Trash2 size={13} /> Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File name */}
      <div>
        <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{d.name}</p>
        <p className="text-xs text-gray-400 mt-1">
          {formatFileSize(d.size ?? 0)} · updated {timeAgo(d.createdAt)}
        </p>
      </div>

      {/* Uploader */}
      {d.uploaderName && (
        <div className="flex items-center gap-1.5 mt-auto">
          <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-[8px] font-bold text-gray-500">
              {d.uploaderName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-gray-400 truncate">{d.uploaderName}</span>
        </div>
      )}
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  folderId,
  userId,
  onClose,
  onUploaded,
}: {
  folderId: string;
  userId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number; current: number; total: number } | null>(null);

  const onDrop = useCallback(async (accepted: File[], rejected: any[]) => {
    if (rejected.length) {
      toast.error(`${rejected[0].file.name}: ${rejected[0].errors?.[0]?.message ?? 'rejected'}`);
    }
    if (!accepted.length) return;
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      try {
        setProgress({ name: file.name, pct: 0, current: i + 1, total: accepted.length });
        const { url, storagePath } = await storageService.uploadDocument(
          folderId, file, userId, pct => setProgress(p => p ? { ...p, pct } : null)
        );
        await addDoc(collection(db, 'documents'), {
          name: file.name,
          originalName: file.name,
          folder: folderId as DocumentFolder,
          downloadURL: url,
          storagePath,
          size: file.size,
          fileType: file.type,
          uploadedBy: userId,
          uploaderName: '',
          createdAt: serverTimestamp(),
        });
        ok++;
      } catch (e: any) {
        toast.error(e.message ?? `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    setProgress(null);
    if (ok) { toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`); onUploaded(); onClose(); }
  }, [folderId, userId, onUploaded, onClose]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
    accept: {
      'image/*': [],
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': [],
      'text/plain': [],
      'text/csv': [],
      'application/zip': [],
      'application/json': [],
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Upload files</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-5">
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
              isDragActive ? 'border-[#1B2B5E] bg-[#1B2B5E]/5' : 'border-gray-200 hover:border-[#1B2B5E]/50 hover:bg-gray-50',
              uploading && 'cursor-default'
            )}
          >
            <input {...getInputProps()} />
            {uploading && progress ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium text-gray-700 truncate max-w-xs">{progress.name}</p>
                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-[#1B2B5E] rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
                </div>
                <p className="text-xs text-gray-400">
                  {progress.total > 1 ? `File ${progress.current} of ${progress.total} · ` : ''}{progress.pct}%
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <div className="w-12 h-12 bg-[#1B2B5E]/8 rounded-2xl flex items-center justify-center mb-1">
                  <Upload size={22} className="text-[#1B2B5E]" />
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {isDragActive ? 'Drop files here' : 'Drag & drop or click to browse'}
                </p>
                <p className="text-xs text-gray-400">PDF, Word, Excel, Images, ZIP and more</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { currentUser } = useAuth();
  const { isHRorAdmin, isAdmin } = useRole();

  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [documents, setDocuments]           = useState<ShipmateDocument[]>([]);
  const [loading, setLoading]               = useState(false);
  const [search, setSearch]                 = useState('');
  const [showUpload, setShowUpload]         = useState(false);
  const [deptFolders, setDeptFolders]       = useState<FolderConfig[]>([]);

  const FIXED_IDS = new Set(FIXED_FOLDERS.map(f => f.id));

  // Load dynamic dept folders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'departments'), snap => {
      const folders: FolderConfig[] = snap.docs
        .filter(d => !FIXED_IDS.has(d.id))
        .map(d => ({
          id: d.id,
          label: d.data().name as string,
          allowedRoles: ['super_admin','hr_admin','manager','employee'],
          isDynamic: true,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setDeptFolders(folders);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allFolders: FolderConfig[] = [
    { id: 'all', label: 'All', allowedRoles: ['super_admin','hr_admin','manager','employee'] },
    FIXED_FOLDERS[0],
    ...deptFolders,
    ...FIXED_FOLDERS.slice(1),
  ];

  const accessibleFolders = allFolders.filter(f =>
    f.allowedRoles.includes(currentUser?.role ?? 'employee')
  );

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      let snap;
      if (selectedFolder === 'all') {
        snap = await getDocs(collection(db, 'documents'));
      } else {
        snap = await getDocs(query(collection(db, 'documents'), where('folder', '==', selectedFolder)));
      }
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ShipmateDocument))
        .sort((a, b) => {
          const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
          const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
          return tb - ta;
        });
      setDocuments(docs);
    } catch (e: any) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [selectedFolder]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  async function handleDelete(docId: string, storagePath: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'documents', docId));
      if (storagePath) await storageService.deleteFile(storagePath);
      toast.success('File deleted');
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch {
      toast.error('Failed to delete file');
    }
  }

  const filtered = documents.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase())
  );

  const currentFolderCfg = allFolders.find(f => f.id === selectedFolder);
  const canUpload = isHRorAdmin || (currentFolderCfg?.allowedRoles.includes('employee') ?? false);
  const canDelete = isAdmin;

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left sidebar ──────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col pt-6 pb-4 hidden md:flex">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 mb-3">Folders</p>
        <div className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto">
          {accessibleFolders.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left w-full',
                selectedFolder === f.id
                  ? 'bg-[#1B2B5E] text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <Folder size={14} className="flex-shrink-0 opacity-70" />
              <span className="truncate">{f.label}</span>
              {f.restricted && <span className="ml-auto text-[9px] opacity-50">🔒</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-black text-gray-900">Documents</h1>
            <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">Secure storage · permission-based access · file versioning</p>
          </div>
          <div className="flex items-center gap-2">
            {canUpload && (
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#1B2B5E] text-white rounded-xl text-sm font-bold hover:bg-[#2D4080] transition-colors"
              >
                <Plus size={15} /> Upload
              </button>
            )}
          </div>
        </div>

        {/* Mobile folder pills */}
        <div className="flex gap-2 overflow-x-auto px-4 py-3 md:hidden no-scrollbar border-b border-gray-100 bg-white">
          {accessibleFolders.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                selectedFolder === f.id ? 'bg-[#1B2B5E] text-white' : 'bg-gray-100 text-gray-600'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search bar */}
        <div className="px-4 md:px-6 py-3 flex-shrink-0">
          <div className="relative max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search files…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Document grid */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="bg-white rounded-2xl border border-gray-100 p-4 h-32 shimmer" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <Folder size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">{search ? 'No files match' : 'No files yet'}</p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? 'Try a different search term.' : canUpload ? 'Click Upload to add files.' : 'No documents uploaded here yet.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(d => (
                <DocumentCard key={d.id} doc={d} canDelete={canDelete} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload modal */}
      {showUpload && currentUser && (
        <UploadModal
          folderId={selectedFolder === 'all' ? 'general' : selectedFolder}
          userId={currentUser.uid}
          onClose={() => setShowUpload(false)}
          onUploaded={loadDocuments}
        />
      )}
    </div>
  );
}
