'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, Folder, FolderOpen, Download, Trash2, Search, X,
  MoreVertical, Plus, ChevronRight, ChevronDown, FolderPlus,
  ArrowLeft, Pencil,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { storageService } from '@/lib/services/storageService';
import { formatFileSize } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import {
  collection, addDoc, deleteDoc, updateDoc, doc,
  query, where, serverTimestamp, onSnapshot, writeBatch, getDocs,
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

interface DocumentSubfolder {
  id: string;
  name: string;
  parentFolder: string;
  createdBy: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
}

interface DocumentSection {
  id: string;
  name: string;
  createdBy: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createdAt: any;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const FIXED_FOLDERS: FolderConfig[] = [
  { id: 'general',         label: 'General',        allowedRoles: ['super_admin','hr_admin','manager','employee'] },
  { id: 'finance',         label: 'Finance',        allowedRoles: ['super_admin','hr_admin'], restricted: true },
  { id: 'hr',              label: 'HR',             allowedRoles: ['super_admin','hr_admin'], restricted: true },
  { id: 'leave-documents', label: 'Leave Documents',allowedRoles: ['super_admin','hr_admin','manager','employee'] },
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
  if (type === 'application/pdf') return { bg: 'bg-red-500',    text: 'text-white' };
  if (type.startsWith('image/'))  return { bg: 'bg-orange-400', text: 'text-white' };
  if (type.includes('word') || type.includes('wordprocessingml')) return { bg: 'bg-blue-500',   text: 'text-white' };
  if (type.includes('sheet') || type.includes('excel') || type.includes('spreadsheetml'))   return { bg: 'bg-green-500',  text: 'text-white' };
  if (type.includes('presentation') || type.includes('powerpoint'))                         return { bg: 'bg-orange-500', text: 'text-white' };
  return { bg: 'bg-gray-500', text: 'text-white' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Create Subfolder Modal ────────────────────────────────────────────────────

function CreateSubfolderModal({
  parentFolderId,
  onClose,
  onCreated,
}: {
  parentFolderId: string;
  onClose: () => void;
  onCreated: (subfolder: DocumentSubfolder) => void;
}) {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed || !currentUser) return;
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, 'document_folders'), {
        name: trimmed,
        parentFolder: parentFolderId,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      toast.success(`Folder "${trimmed}" created`);
      onCreated({ id: ref.id, name: trimmed, parentFolder: parentFolderId, createdBy: currentUser.uid, createdAt: null });
      onClose();
    } catch {
      toast.error('Failed to create folder');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#1B2B5E]/8 flex items-center justify-center">
            <FolderPlus size={18} className="text-[#1B2B5E]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">New Folder</h2>
            <p className="text-xs text-gray-400">Inside: {FIXED_FOLDERS.find(f => f.id === parentFolderId)?.label ?? parentFolderId}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
          placeholder="Folder name…"
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create / Rename Section Modal ────────────────────────────────────────────

function SectionModal({
  existing,
  onClose,
}: {
  existing?: DocumentSection;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const [name, setName] = useState(existing?.name ?? '');
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed || !currentUser) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateDoc(doc(db, 'document_sections', existing.id), { name: trimmed });
        toast.success('Folder renamed');
      } else {
        await addDoc(collection(db, 'document_sections'), {
          name: trimmed,
          createdBy: currentUser.uid,
          createdAt: serverTimestamp(),
        });
        toast.success(`Folder "${trimmed}" created`);
      }
      onClose();
    } catch {
      toast.error(isEdit ? 'Failed to rename folder' : 'Failed to create folder');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#1B2B5E]/8 flex items-center justify-center">
            <FolderPlus size={18} className="text-[#1B2B5E]" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Rename Folder' : 'New Folder'}</h2>
            <p className="text-xs text-gray-400">{isEdit ? 'Change the folder name' : 'Create a new top-level folder'}</p>
          </div>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <input
          autoFocus
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
          placeholder="Folder name…"
          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E] mb-4"
        />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-semibold hover:bg-[#2D4080] disabled:opacity-50"
          >
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
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
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
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

      <div>
        <p className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug">{d.name}</p>
        <p className="text-xs text-gray-400 mt-1">
          {formatFileSize(d.size ?? 0)} · {timeAgo(d.createdAt)}
        </p>
      </div>

      {d.uploaderName && (
        <div className="flex items-center gap-1.5 mt-auto">
          <div className="w-4 h-4 rounded-full bg-[#1B2B5E]/10 flex items-center justify-center">
            <span className="text-[8px] font-bold text-[#1B2B5E]">
              {d.uploaderName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-gray-400 truncate">{d.uploaderName}</span>
        </div>
      )}
    </div>
  );
}

// ── Subfolder Card ────────────────────────────────────────────────────────────

function SubfolderCard({
  subfolder,
  fileCount,
  onClick,
}: {
  subfolder: DocumentSubfolder;
  fileCount: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:shadow-md hover:border-[#1B2B5E]/20 transition-all text-left w-full group"
    >
      <div className="w-10 h-10 rounded-xl bg-[#F5C518]/15 flex items-center justify-center flex-shrink-0 group-hover:bg-[#F5C518]/25 transition-colors">
        <Folder size={18} className="text-[#F5C518]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 truncate">{subfolder.name}</p>
        <p className="text-xs text-gray-400">{fileCount} {fileCount === 1 ? 'file' : 'files'}</p>
      </div>
      <ChevronRight size={15} className="text-gray-300 group-hover:text-[#1B2B5E] transition-colors flex-shrink-0" />
    </button>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  folderId,
  subfolderId,
  userId,
  uploaderName,
  onClose,
  onUploaded,
}: {
  folderId: string;
  subfolderId: string | null;
  userId: string;
  uploaderName: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number; current: number; total: number } | null>(null);

  const onDrop = useCallback(async (accepted: File[], rejected: { file: File; errors: { message: string }[] }[]) => {
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
          folderId, file, userId, pct => setProgress(p => p ? { ...p, pct } : null),
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docData: any = {
          name: file.name,
          originalName: file.name,
          folder: folderId as DocumentFolder,
          downloadURL: url,
          storagePath,
          size: file.size,
          fileType: file.type,
          uploadedBy: userId,
          uploaderName,
          createdAt: serverTimestamp(),
        };
        if (subfolderId) docData.subfolderId = subfolderId;
        await addDoc(collection(db, 'documents'), docData);
        ok++;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        toast.error(msg ?? `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    setProgress(null);
    if (ok) { toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`); onUploaded(); onClose(); }
  }, [folderId, subfolderId, userId, uploaderName, onUploaded, onClose]);

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
          <div>
            <h2 className="text-base font-bold text-gray-900">Upload files</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Uploading to: <span className="font-medium text-gray-600">{folderId}</span>
              {subfolderId && <span className="text-gray-400"> / subfolder</span>}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
        </div>
        <div className="p-5">
          <div
            {...getRootProps()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
              isDragActive ? 'border-[#1B2B5E] bg-[#1B2B5E]/5' : 'border-gray-200 hover:border-[#1B2B5E]/50 hover:bg-gray-50',
              uploading && 'cursor-default',
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

  // Navigation
  const [selectedFolder,    setSelectedFolder]    = useState<string>('general');
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [expandedFolders,   setExpandedFolders]   = useState<Set<string>>(new Set(['general']));

  // Data
  const [documents,      setDocuments]      = useState<ShipmateDocument[]>([]);
  const [allFolderDocs,  setAllFolderDocs]  = useState<ShipmateDocument[]>([]); // full set for subfolder counts
  const [subfolders,     setSubfolders]     = useState<DocumentSubfolder[]>([]);
  const [deptFolders,    setDeptFolders]    = useState<FolderConfig[]>([]);
  const [docSections,    setDocSections]    = useState<DocumentSection[]>([]);

  // UI
  const [search,              setSearch]              = useState('');
  const [showUpload,          setShowUpload]          = useState(false);
  const [createSubfolderFor,  setCreateSubfolderFor]  = useState<string | null>(null);
  const [showCreateSection,   setShowCreateSection]   = useState(false);
  const [renamingSection,     setRenamingSection]     = useState<DocumentSection | null>(null);
  const [sectionMenuOpen,     setSectionMenuOpen]     = useState<string | null>(null);
  const sectionMenuRef = useRef<HTMLDivElement>(null);

  const FIXED_IDS = new Set(FIXED_FOLDERS.map(f => f.id));

  // ── Subscriptions ───────────────────────────────────────────────────────────

  // Department folders
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

  // Document sections (custom top-level folders)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'document_sections'), snap => {
      const secs = snap.docs
        .map(d => ({
          id: d.id,
          name: d.data().name as string,
          createdBy: d.data().createdBy as string,
          createdAt: d.data().createdAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setDocSections(secs);
    });
    return () => unsub();
  }, []);

  // Close section menu on outside click
  useEffect(() => {
    if (!sectionMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!sectionMenuRef.current?.contains(e.target as Node)) setSectionMenuOpen(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sectionMenuOpen]);

  // Subfolders
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'document_folders'), snap => {
      const sfs = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name as string,
        parentFolder: d.data().parentFolder as string,
        createdBy: d.data().createdBy as string,
        createdAt: d.data().createdAt,
      }));
      setSubfolders(sfs);
    });
    return () => unsub();
  }, []);

  // Documents — reactive to folder/subfolder selection
  useEffect(() => {
    let q;
    if (selectedSubfolder) {
      q = query(collection(db, 'documents'), where('subfolderId', '==', selectedSubfolder));
    } else if (selectedFolder === 'all') {
      q = collection(db, 'documents');
    } else {
      // Top-level: fetch ALL docs for this folder (we'll split root vs subfolder below)
      q = query(collection(db, 'documents'), where('folder', '==', selectedFolder));
    }

    const unsub = onSnapshot(q, snap => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ShipmateDocument))
        .sort((a, b) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
          return tb - ta;
        });

      // Keep full set for subfolder file-count badges
      if (!selectedSubfolder && selectedFolder !== 'all') {
        setAllFolderDocs(all);
      }

      // Only surface root-level docs when at the top-level view
      const visible = (!selectedSubfolder && selectedFolder !== 'all')
        ? all.filter(d => !d.subfolderId)
        : all;

      setDocuments(visible);
    });
    return () => unsub();
  }, [selectedFolder, selectedSubfolder]);

  // ── Derived data ────────────────────────────────────────────────────────────

  // Custom document sections become FolderConfig entries
  const customSectionFolders: FolderConfig[] = docSections.map(s => ({
    id: s.id,
    label: s.name,
    allowedRoles: ['super_admin','hr_admin','manager','employee'],
    isDynamic: true,
  }));

  const allFolders: FolderConfig[] = [
    { id: 'all', label: 'All Documents', allowedRoles: ['super_admin','hr_admin','manager','employee'] },
    ...FIXED_FOLDERS,
    ...deptFolders,
    ...customSectionFolders,
  ];

  const accessibleFolders = allFolders.filter(f =>
    f.allowedRoles.includes(currentUser?.role ?? 'employee'),
  );

  const currentFolderCfg    = allFolders.find(f => f.id === selectedFolder);
  const currentSubfolderCfg = subfolders.find(sf => sf.id === selectedSubfolder);
  const canUpload = isHRorAdmin || (currentFolderCfg?.allowedRoles.includes('employee') ?? false);
  const canDelete = isAdmin || isHRorAdmin;

  // Subfolders visible in current top-level folder
  const folderSubfolders = subfolders.filter(sf => sf.parentFolder === selectedFolder);

  // File count per subfolder (for card badges) — derived from the full folder fetch
  function subfolderFileCount(sfId: string): number {
    return allFolderDocs.filter(d => d.subfolderId === sfId).length;
  }

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleDelete(docId: string, storagePath: string) {
    if (!confirm('Delete this file? This cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'documents', docId));
      if (storagePath) await storageService.deleteFile(storagePath);
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete file');
    }
  }

  async function handleDeleteSection(section: DocumentSection) {
    if (!confirm(`Delete folder "${section.name}"? All files inside will move to their parent folder.`)) return;
    try {
      const batch = writeBatch(db);
      // Move any documents in this section back to "general"
      const docsSnap = await getDocs(query(collection(db, 'documents'), where('folder', '==', section.id)));
      docsSnap.docs.forEach(d => batch.update(d.ref, { folder: 'general' }));
      // Delete any subfolders belonging to this section
      const sfSnap = await getDocs(query(collection(db, 'document_folders'), where('parentFolder', '==', section.id)));
      sfSnap.docs.forEach(d => batch.delete(d.ref));
      // Delete the section itself
      batch.delete(doc(db, 'document_sections', section.id));
      await batch.commit();
      // If we were viewing this section, fall back to all
      if (selectedFolder === section.id) selectFolder('all');
      toast.success(`Folder "${section.name}" deleted`);
    } catch {
      toast.error('Failed to delete folder');
    }
  }

  function selectFolder(id: string) {
    setSelectedFolder(id);
    setSelectedSubfolder(null);
    setSearch('');
    // Auto-expand the folder in sidebar
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function toggleExpand(id: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filtered = documents.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()),
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Left sidebar (desktop) ─────────────────────────────────── */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col pt-5 pb-4 hidden md:flex overflow-hidden">
        <div className="flex items-center justify-between px-5 mb-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Folders</p>
          {isHRorAdmin && (
            <button
              onClick={() => setShowCreateSection(true)}
              title="New top-level folder"
              className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors"
            >
              <Plus size={13} />
            </button>
          )}
        </div>
        <div className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto">
          {accessibleFolders.map(f => {
            const folderSubs = subfolders.filter(sf => sf.parentFolder === f.id);
            const isExpanded = expandedFolders.has(f.id);
            const isActive   = selectedFolder === f.id && !selectedSubfolder;

            const isCustomSection = docSections.some(s => s.id === f.id);
            const sectionData     = docSections.find(s => s.id === f.id);

            return (
              <div key={f.id}>
                {/* Folder row */}
                <div className="flex items-center group/row">
                  {/* Expand toggle */}
                  {f.id !== 'all' && folderSubs.length > 0 ? (
                    <button
                      onClick={() => toggleExpand(f.id)}
                      className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 flex-shrink-0 ml-1"
                    >
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  ) : (
                    <div className="w-6 flex-shrink-0" />
                  )}

                  <button
                    onClick={() => selectFolder(f.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2 px-2 py-2 rounded-xl text-sm font-medium transition-all text-left min-w-0',
                      isActive ? 'bg-[#1B2B5E] text-white' : 'text-gray-600 hover:bg-gray-50',
                    )}
                  >
                    <Folder size={14} className="flex-shrink-0 opacity-70" />
                    <span className="truncate flex-1">{f.label}</span>
                    {f.restricted && <span className="text-[9px] opacity-50">🔒</span>}
                  </button>

                  {/* Add subfolder button — HR/admin only, real folders only */}
                  {isHRorAdmin && f.id !== 'all' && !isCustomSection && (
                    <button
                      onClick={() => { setCreateSubfolderFor(f.id); if (!isExpanded) toggleExpand(f.id); }}
                      title="New subfolder"
                      className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors opacity-0 group-hover/row:opacity-100 flex-shrink-0"
                    >
                      <Plus size={12} />
                    </button>
                  )}

                  {/* ⋯ menu for custom sections — HR/admin only */}
                  {isHRorAdmin && isCustomSection && sectionData && (
                    <div className="relative flex-shrink-0" ref={sectionMenuOpen === f.id ? sectionMenuRef : null}>
                      <button
                        onClick={() => setSectionMenuOpen(o => o === f.id ? null : f.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors opacity-0 group-hover/row:opacity-100"
                      >
                        <MoreVertical size={12} />
                      </button>
                      {sectionMenuOpen === f.id && (
                        <div className="absolute right-0 top-7 z-30 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[130px]">
                          <button
                            onClick={() => { setSectionMenuOpen(null); setRenamingSection(sectionData); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                          >
                            <Pencil size={12} /> Rename
                          </button>
                          <button
                            onClick={() => { setSectionMenuOpen(null); handleDeleteSection(sectionData); }}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Subfolders */}
                {isExpanded && folderSubs.length > 0 && (
                  <div className="ml-6 mt-0.5 flex flex-col gap-0.5">
                    {folderSubs.map(sf => (
                      <button
                        key={sf.id}
                        onClick={() => { setSelectedFolder(f.id); setSelectedSubfolder(sf.id); setSearch(''); }}
                        className={cn(
                          'flex items-center gap-2 px-2 py-1.5 rounded-xl text-xs font-medium transition-all text-left w-full',
                          selectedSubfolder === sf.id
                            ? 'bg-[#1B2B5E] text-white'
                            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                        )}
                      >
                        <FolderOpen size={12} className="flex-shrink-0 opacity-70" />
                        <span className="truncate">{sf.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main area ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Back button when inside a subfolder (mobile) */}
            {selectedSubfolder && (
              <button
                onClick={() => setSelectedSubfolder(null)}
                className="text-gray-500 hover:text-gray-700 md:hidden"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <div className="min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedSubfolder(null)}
                  className={cn(
                    'text-sm font-bold truncate',
                    selectedSubfolder ? 'text-[#1B2B5E] hover:underline cursor-pointer' : 'text-gray-900',
                  )}
                >
                  {currentFolderCfg?.label ?? selectedFolder}
                </button>
                {selectedSubfolder && currentSubfolderCfg && (
                  <>
                    <ChevronRight size={13} className="text-gray-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-gray-900 truncate">{currentSubfolderCfg.name}</span>
                  </>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                {selectedSubfolder ? `Subfolder · ${filtered.length} files` : `${folderSubfolders.length} subfolders · ${filtered.length} files`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Add subfolder — desktop button, shown when in top-level folder view */}
            {isHRorAdmin && !selectedSubfolder && selectedFolder !== 'all' && (
              <button
                onClick={() => setCreateSubfolderFor(selectedFolder)}
                className="hidden md:flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                <FolderPlus size={15} />
                <span className="hidden lg:inline">New Folder</span>
              </button>
            )}
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
        <div className="flex gap-2 overflow-x-auto px-4 py-3 md:hidden border-b border-gray-100 bg-white">
          {accessibleFolders.map(f => (
            <button
              key={f.id}
              onClick={() => selectFolder(f.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                selectedFolder === f.id && !selectedSubfolder ? 'bg-[#1B2B5E] text-white' : 'bg-gray-100 text-gray-600',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
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

        {/* Content grid */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 pb-6 space-y-6">

          {/* Subfolder cards — only when viewing a top-level folder, not searching */}
          {!selectedSubfolder && selectedFolder !== 'all' && !search && folderSubfolders.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Subfolders</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {folderSubfolders.map(sf => (
                  <SubfolderCard
                    key={sf.id}
                    subfolder={sf}
                    fileCount={subfolderFileCount(sf.id)}
                    onClick={() => { setSelectedSubfolder(sf.id); setSearch(''); }}
                  />
                ))}
                {/* Add subfolder card — HR/admin only */}
                {isHRorAdmin && (
                  <button
                    onClick={() => setCreateSubfolderFor(selectedFolder)}
                    className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-4 flex items-center gap-3 hover:border-[#1B2B5E]/40 hover:bg-[#1B2B5E]/3 transition-all text-left w-full group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#1B2B5E]/10 transition-colors">
                      <FolderPlus size={18} className="text-gray-400 group-hover:text-[#1B2B5E]" />
                    </div>
                    <span className="text-sm font-semibold text-gray-400 group-hover:text-[#1B2B5E] transition-colors">New Folder</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* "New Folder" prompt when no subfolders yet — HR/admin only */}
          {!selectedSubfolder && selectedFolder !== 'all' && !search && folderSubfolders.length === 0 && isHRorAdmin && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Subfolders</p>
              <button
                onClick={() => setCreateSubfolderFor(selectedFolder)}
                className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-5 flex items-center gap-3 hover:border-[#1B2B5E]/40 hover:bg-[#1B2B5E]/3 transition-all text-left w-full max-w-xs group"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 group-hover:bg-[#1B2B5E]/10 transition-colors">
                  <FolderPlus size={18} className="text-gray-400 group-hover:text-[#1B2B5E]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600 group-hover:text-[#1B2B5E] transition-colors">Create a subfolder</p>
                  <p className="text-xs text-gray-400">Organise documents by person or topic</p>
                </div>
              </button>
            </div>
          )}

          {/* Files */}
          {(selectedSubfolder || selectedFolder === 'all' || search || folderSubfolders.length === 0 || filtered.length > 0) && (
            <div>
              {(!selectedSubfolder && selectedFolder !== 'all' && !search) && (
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Files</p>
              )}
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                    <Folder size={20} className="text-gray-300" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">{search ? 'No files match' : 'No files here yet'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {search ? 'Try a different search.' : canUpload ? 'Click Upload to add files.' : 'No documents uploaded here yet.'}
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
          )}
        </div>
      </div>

      {/* ── Modals ────────────────────────────────────────────────── */}

      {showUpload && currentUser && (
        <UploadModal
          folderId={selectedFolder === 'all' ? 'general' : selectedFolder}
          subfolderId={selectedSubfolder}
          userId={currentUser.uid}
          uploaderName={currentUser.name ?? ''}
          onClose={() => setShowUpload(false)}
          onUploaded={() => {}}
        />
      )}

      {createSubfolderFor && (
        <CreateSubfolderModal
          parentFolderId={createSubfolderFor}
          onClose={() => setCreateSubfolderFor(null)}
          onCreated={sf => {
            setExpandedFolders(prev => new Set([...prev, createSubfolderFor]));
            setSelectedFolder(sf.parentFolder);
            setSelectedSubfolder(sf.id);
          }}
        />
      )}

      {showCreateSection && (
        <SectionModal onClose={() => setShowCreateSection(false)} />
      )}

      {renamingSection && (
        <SectionModal existing={renamingSection} onClose={() => setRenamingSection(null)} />
      )}
    </div>
  );
}
