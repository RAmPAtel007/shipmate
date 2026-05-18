'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Upload, Folder, Download, Trash2, Search, X,
  MoreVertical, Plus, ChevronRight, ChevronDown,
  MoreHorizontal, Grid, List, FileText, Pencil, Move,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { storageService } from '@/lib/services/storageService';
import { formatFileSize } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, setDoc,
  query, where, serverTimestamp, onSnapshot, writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateDocument, DocumentFolder, ShipmateUser } from '@/lib/types';
import toast from 'react-hot-toast';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FolderConfig {
  id: string;
  label: string;
  restricted?: boolean;
  isDynamic?: boolean;
}

interface DocumentSubfolder {
  id: string;
  name: string;
  parentFolder: string;
  createdBy: string;
  createdAt: any;
}

interface DocumentSection {
  id: string;
  name: string;
  createdBy: string;
  createdAt: any;
}

type SortOption = 'newest' | 'oldest' | 'name-az' | 'largest' | 'smallest';
type ViewMode = 'grid' | 'list';

// ── Fixed Folders ─────────────────────────────────────────────────────────────

const FIXED_FOLDERS: FolderConfig[] = [
  { id: 'general',         label: 'General' },
  { id: 'hr',              label: 'HR',              restricted: true },
  { id: 'finance',         label: 'Finance',         restricted: true },
  { id: 'leave-documents', label: 'Leave Documents' },
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
  if (type === 'application/pdf') return { bg: 'bg-red-500', text: 'text-white' };
  if (type.startsWith('image/')) return { bg: 'bg-orange-400', text: 'text-white' };
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
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Subfolder Create/Rename Modal ─────────────────────────────────────────────

function SubfolderModal({
  mode,
  initialName,
  parentFolderId,
  userId,
  subfolderId,
  onClose,
  onDone,
}: {
  mode: 'create' | 'rename';
  initialName?: string;
  parentFolderId: string;
  userId: string;
  subfolderId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(initialName ?? '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (mode === 'create') {
        await addDoc(collection(db, 'document_folders'), {
          name: trimmed,
          parentFolder: parentFolderId,
          createdBy: userId,
          createdAt: serverTimestamp(),
        });
        toast.success('Subfolder created');
      } else {
        await updateDoc(doc(db, 'document_folders', subfolderId!), { name: trimmed });
        toast.success('Subfolder renamed');
      }
      onDone();
      onClose();
    } catch {
      toast.error(mode === 'create' ? 'Failed to create subfolder' : 'Failed to rename subfolder');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            {mode === 'create' ? 'New Subfolder' : 'Rename Subfolder'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            placeholder="Subfolder name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Section (top-level folder) Create/Rename Modal ───────────────────────────

function SectionModal({
  existing,
  userId,
  onClose,
  collectionName = 'document_sections',
}: {
  existing?: DocumentSection;
  userId: string;
  onClose: () => void;
  collectionName?: string;
}) {
  const [name, setName] = useState(existing?.name ?? '');
  const [saving, setSaving] = useState(false);
  const isEdit = !!existing;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateDoc(doc(db, collectionName, existing.id), { name: trimmed });
        toast.success('Folder renamed');
      } else {
        await addDoc(collection(db, collectionName), {
          name: trimmed,
          createdBy: userId,
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Rename Folder' : 'New Folder'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            placeholder="Folder name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Rename' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rename File Modal ─────────────────────────────────────────────────────────

function RenameFileModal({
  fileId,
  currentName,
  onClose,
}: {
  fileId: string;
  currentName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) { onClose(); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'documents', fileId), { name: trimmed });
      toast.success('File renamed');
      onClose();
    } catch {
      toast.error('Failed to rename file');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Rename File</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Move File Modal ───────────────────────────────────────────────────────────

function MoveFileModal({
  fileId,
  allFolders,
  subfolders,
  onClose,
}: {
  fileId: string;
  allFolders: FolderConfig[];
  subfolders: DocumentSubfolder[];
  onClose: () => void;
}) {
  const targetableFolders = allFolders.filter(f => f.id !== 'all');
  const [targetFolder, setTargetFolder] = useState(targetableFolders[0]?.id ?? 'general');
  const [targetSubfolder, setTargetSubfolder] = useState('');
  const [saving, setSaving] = useState(false);

  const availableSubfolders = subfolders.filter(sf => sf.parentFolder === targetFolder);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'documents', fileId), {
        folder: targetFolder as DocumentFolder,
        subfolderId: targetSubfolder || null,
      });
      toast.success('File moved');
      onClose();
    } catch {
      toast.error('Failed to move file');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Move File</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Folder</label>
            <select
              value={targetFolder}
              onChange={e => { setTargetFolder(e.target.value); setTargetSubfolder(''); }}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
            >
              {targetableFolders.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          {availableSubfolders.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Subfolder (optional)</label>
              <select
                value={targetSubfolder}
                onChange={e => setTargetSubfolder(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
              >
                <option value="">— None —</option>
                {availableSubfolders.map(sf => (
                  <option key={sf.id} value={sf.id}>{sf.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Moving…' : 'Move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Upload Modal ──────────────────────────────────────────────────────────────

function UploadModal({
  folderId,
  subfolderId,
  currentUser,
  allUsers,
  onClose,
}: {
  folderId: string;
  subfolderId: string | null;
  currentUser: ShipmateUser;
  allUsers: ShipmateUser[];
  onClose: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number; current: number; total: number } | null>(null);
  const [linkedUserId, setLinkedUserId] = useState('');
  // Files staged for upload — user confirms before anything is sent
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  // onDrop just stages files; does NOT upload yet
  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    if (rejected.length) {
      toast.error(`${rejected[0].file.name}: ${rejected[0].errors?.[0]?.message ?? 'rejected'}`);
    }
    if (!accepted.length) return;
    setStagedFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...accepted.filter(f => !names.has(f.name))];
    });
  }, []);

  // Actual upload — only when user clicks the Upload button
  const handleUpload = useCallback(async () => {
    if (!stagedFiles.length) return;
    setUploading(true);
    let ok = 0;
    for (let i = 0; i < stagedFiles.length; i++) {
      const file = stagedFiles[i];
      try {
        setProgress({ name: file.name, pct: 0, current: i + 1, total: stagedFiles.length });
        const { url, storagePath } = await storageService.uploadDocument(
          folderId, file, currentUser.uid, pct => setProgress(p => p ? { ...p, pct } : null)
        );
        const docData: Record<string, any> = {
          name: file.name,
          originalName: file.name,
          folder: folderId as DocumentFolder,
          downloadURL: url,
          storagePath,
          size: file.size,
          fileType: file.type,
          uploadedBy: currentUser.uid,
          uploaderName: currentUser.name ?? '',
          createdAt: serverTimestamp(),
        };
        if (subfolderId) docData.subfolderId = subfolderId;
        if (linkedUserId) docData.linkedUserId = linkedUserId;
        await addDoc(collection(db, 'documents'), docData);
        ok++;
      } catch (e: any) {
        toast.error(e.message ?? `Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    setProgress(null);
    if (ok) { toast.success(`${ok} file${ok > 1 ? 's' : ''} uploaded`); onClose(); }
  }, [stagedFiles, folderId, subfolderId, currentUser, linkedUserId, onClose]);

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
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={!uploading ? onClose : undefined}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-900">Upload Files</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              To: <span className="font-medium text-gray-600 capitalize">{folderId.replace(/-/g, ' ')}</span>
            </p>
          </div>
          {!uploading && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          )}
        </div>

        <div className="p-5 space-y-4">

          {/* Drop zone */}
          {!uploading && (
            <div
              {...getRootProps()}
              className={cn(
                'border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer',
                isDragActive ? 'border-[#1B2B5E] bg-[#1B2B5E]/5' : 'border-gray-200 hover:border-[#1B2B5E]/50 hover:bg-gray-50',
              )}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-2">
                <div className="w-10 h-10 bg-[#1B2B5E]/10 rounded-xl flex items-center justify-center">
                  <Upload size={18} className="text-[#1B2B5E]" />
                </div>
                <p className="text-sm font-semibold text-gray-800">
                  {isDragActive ? 'Drop files here' : 'Drag & drop or click to browse'}
                </p>
                <p className="text-xs text-gray-400">PDF, Word, Excel, Images, ZIP and more</p>
              </div>
            </div>
          )}

          {/* Upload progress */}
          {uploading && progress && (
            <div className="rounded-xl border border-gray-100 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className="truncate max-w-[60%] font-medium text-gray-700">{progress.name}</span>
                <span>{progress.total > 1 ? `${progress.current}/${progress.total} · ` : ''}{progress.pct}%</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1B2B5E] rounded-full transition-all duration-300" style={{ width: `${progress.pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-center">Uploading… please wait</p>
            </div>
          )}

          {/* Staged files */}
          {stagedFiles.length > 0 && !uploading && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                Ready to upload ({stagedFiles.length})
              </p>
              <div className="divide-y divide-gray-50 border border-gray-100 rounded-xl overflow-hidden">
                {stagedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-white">
                    <div className="w-8 h-8 rounded-lg bg-[#1B2B5E]/8 flex items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-black text-[#1B2B5E]">
                        {file.name.split('.').pop()?.toUpperCase().slice(0,4) ?? 'FILE'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                    <button
                      onClick={() => setStagedFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                    >
                      <X size={14}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link to employee */}
          {allUsers.length > 0 && !uploading && (
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">
                Link to Employee (optional)
              </label>
              <select
                value={linkedUserId}
                onChange={e => setLinkedUserId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
              >
                <option value="">— None —</option>
                {allUsers.map(u => (
                  <option key={u.uid} value={u.uid}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Action buttons */}
          {!uploading && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={stagedFiles.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-[#1B2B5E] text-white text-sm font-bold hover:bg-[#2D4080] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Upload size={14}/>
                Upload {stagedFiles.length > 0 ? `(${stagedFiles.length})` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── File Card (Grid) ──────────────────────────────────────────────────────────

function FileCard({
  document: d,
  subfolders,
  allFolders,
  onDelete,
  onRename,
  onMove,
}: {
  document: ShipmateDocument;
  subfolders: DocumentSubfolder[];
  allFolders: FolderConfig[];
  onDelete: (id: string, storagePath: string) => void;
  onRename: (id: string, currentName: string) => void;
  onMove: (id: string) => void;
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
            <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]">
              <a
                href={d.downloadURL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download size={13} /> Download
              </a>
              <button
                onClick={() => { setMenuOpen(false); onRename(d.id!, d.name); }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
              >
                <Pencil size={13} /> Rename
              </button>
              <button
                onClick={() => { setMenuOpen(false); onMove(d.id!); }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
              >
                <Move size={13} /> Move
              </button>
              <button
                onClick={() => { setMenuOpen(false); onDelete(d.id!, d.storagePath ?? ''); }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
              >
                <Trash2 size={13} /> Delete
              </button>
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
          <div className="w-5 h-5 rounded-full bg-[#1B2B5E] flex items-center justify-center">
            <span className="text-[9px] font-bold text-white">
              {d.uploaderName.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="text-xs text-gray-400 truncate">{d.uploaderName}</span>
        </div>
      )}
    </div>
  );
}

// ── File Row (List) ───────────────────────────────────────────────────────────

function FileRow({
  document: d,
  subfolders,
  allFolders,
  onDelete,
  onRename,
  onMove,
}: {
  document: ShipmateDocument;
  subfolders: DocumentSubfolder[];
  allFolders: FolderConfig[];
  onDelete: (id: string, storagePath: string) => void;
  onRename: (id: string, currentName: string) => void;
  onMove: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const ext = getExtLabel(d.name, d.fileType ?? '');
  const { bg, text } = getExtStyle(d.fileType ?? '');
  const subfolder = subfolders.find(sf => sf.id === d.subfolderId);
  const folder = allFolders.find(f => f.id === d.folder);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide flex-shrink-0 ${bg} ${text}`}>
        {ext}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
      </div>
      <span className="text-xs text-gray-400 w-28 truncate hidden md:block">
        {subfolder ? subfolder.name : folder ? folder.label : d.folder}
      </span>
      <span className="text-xs text-gray-400 w-24 truncate hidden lg:block">{d.uploaderName}</span>
      <span className="text-xs text-gray-400 w-16 text-right hidden sm:block">{formatFileSize(d.size ?? 0)}</span>
      <span className="text-xs text-gray-400 w-20 text-right hidden md:block">{timeAgo(d.createdAt)}</span>
      <div ref={menuRef} className="relative flex-shrink-0">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <MoreHorizontal size={15} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[140px]">
            <a
              href={d.downloadURL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Download size={13} /> Download
            </a>
            <button
              onClick={() => { setMenuOpen(false); onRename(d.id!, d.name); }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
            >
              <Pencil size={13} /> Rename
            </button>
            <button
              onClick={() => { setMenuOpen(false); onMove(d.id!); }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
            >
              <Move size={13} /> Move
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(d.id!, d.storagePath ?? ''); }}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full text-left"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

function Sidebar({
  allFolders,
  subfolders,
  selectedFolder,
  selectedSubfolder,
  expandedFolders,
  docSections,
  onSelectFolder,
  onSelectSubfolder,
  onToggleExpand,
  onCreateSubfolder,
  onRenameSubfolder,
  onDeleteSubfolder,
  onCreateSection,
  onRenameSection,
  onDeleteSection,
  onRenameDeptFolder,
  onDeleteDeptFolder,
  onRenameFixedFolder,
  onDeleteFixedFolder,
}: {
  allFolders: FolderConfig[];
  subfolders: DocumentSubfolder[];
  docSections: DocumentSection[];
  selectedFolder: string;
  selectedSubfolder: string | null;
  expandedFolders: Set<string>;
  onSelectFolder: (id: string) => void;
  onSelectSubfolder: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onCreateSubfolder: (parentId: string) => void;
  onRenameSubfolder: (sf: DocumentSubfolder) => void;
  onDeleteSubfolder: (sf: DocumentSubfolder) => void;
  onCreateSection: () => void;
  onRenameSection: (s: DocumentSection) => void;
  onDeleteSection: (s: DocumentSection) => void;
  onRenameDeptFolder: (f: FolderConfig) => void;
  onDeleteDeptFolder: (f: FolderConfig) => void;
  onRenameFixedFolder: (f: FolderConfig) => void;
  onDeleteFixedFolder: (f: FolderConfig) => void;
}) {
  const [activeDropdown, setActiveDropdown] = useState<{
    type: 'section' | 'deptfolder' | 'fixed' | 'subfolder';
    data: DocumentSection | DocumentSubfolder | FolderConfig;
    parentFolderId: string;
    top: number;
    left: number;
  } | null>(null);

  function openDropdown(
    type: 'section' | 'deptfolder' | 'fixed' | 'subfolder',
    data: any,
    parentFolderId: string,
    e: React.MouseEvent
  ) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Estimated dropdown heights
    const estimatedH = type === 'fixed' ? 120 : type === 'subfolder' ? 72 : 140;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < estimatedH + 12
      ? rect.top - estimatedH - 4   // flip upward
      : rect.bottom + 4;
    setActiveDropdown({ type, data, parentFolderId, top, left: Math.max(8, rect.right - 150) });
  }

  useEffect(() => {
    if (!activeDropdown) return;
    const handler = () => setActiveDropdown(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeDropdown]);

  return (
    <>
      <div className="w-60 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col pt-6 pb-4">
        <div className="flex items-center justify-between px-5 mb-3">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Folders</p>
          <button
            onClick={onCreateSection}
            title="New top-level folder"
            className="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-[#1B2B5E] hover:bg-[#1B2B5E]/8 transition-colors"
          >
            <Plus size={13} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5 px-3 flex-1 overflow-y-auto">

          {/* All Documents */}
          <button
            onClick={() => onSelectFolder('all')}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all text-left w-full',
              selectedFolder === 'all' && !selectedSubfolder
                ? 'bg-[#1B2B5E] text-white'
                : 'text-gray-600 hover:bg-gray-50'
            )}
          >
            <FileText size={14} className="flex-shrink-0 opacity-70" />
            <span>All Documents</span>
          </button>

          {/* Top-level folders */}
          {allFolders.filter(f => f.id !== 'all').map(folder => {
            const folderSubs     = subfolders.filter(sf => sf.parentFolder === folder.id);
            const isExpanded     = expandedFolders.has(folder.id);
            const isFolderActive = selectedFolder === folder.id && !selectedSubfolder;
            const sectionData    = docSections.find(s => s.id === folder.id);
            const isCustomSection = !!sectionData;

            return (
              <div key={folder.id}>
                <div
                  className={cn(
                    'group flex items-center gap-1 px-2 py-2 rounded-xl transition-all cursor-pointer',
                    isFolderActive
                      ? 'bg-[#1B2B5E] text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {/* Expand toggle */}
                  <button
                    onClick={() => onToggleExpand(folder.id)}
                    className="flex-shrink-0 w-4 h-4 flex items-center justify-center"
                  >
                    {folderSubs.length > 0 ? (
                      isExpanded
                        ? <ChevronDown size={12} />
                        : <ChevronRight size={12} />
                    ) : <span className="w-3" />}
                  </button>

                  {/* Folder icon + label */}
                  <button
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    onClick={() => { onSelectFolder(folder.id); if (!isExpanded && folderSubs.length > 0) onToggleExpand(folder.id); }}
                  >
                    <Folder size={14} className="flex-shrink-0 opacity-70" />
                    <span className="truncate text-sm font-medium">{folder.label}</span>
                    {folder.restricted && <span className="ml-1 text-[9px] opacity-50">🔒</span>}
                  </button>

                  {/* All folders get ⋯ — dynamic ones also get Rename/Delete inside */}
                  <button
                    onClick={e => openDropdown(
                      isCustomSection ? 'section' : folder.isDynamic ? 'deptfolder' : 'fixed',
                      isCustomSection ? sectionData : folder,
                      folder.id,
                      e
                    )}
                    className={cn(
                      'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity',
                      isFolderActive ? 'hover:bg-white/20' : 'hover:bg-gray-200'
                    )}
                  >
                    <MoreHorizontal size={11} />
                  </button>
                </div>

                {/* Subfolders */}
                {isExpanded && folderSubs.length > 0 && (
                  <div className="ml-5 mt-0.5 flex flex-col gap-0.5">
                    {folderSubs.map(sf => {
                      const isSubActive = selectedSubfolder === sf.id;
                      return (
                        <div
                          key={sf.id}
                          className={cn(
                            'group flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all cursor-pointer',
                            isSubActive
                              ? 'bg-[#1B2B5E] text-white'
                              : 'text-gray-500 hover:bg-gray-50'
                          )}
                        >
                          <button
                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                            onClick={() => { onSelectFolder(folder.id); onSelectSubfolder(sf.id); }}
                          >
                            <Folder size={12} className="flex-shrink-0 opacity-60" />
                            <span className="text-xs truncate">{sf.name}</span>
                          </button>

                          <button
                            onClick={e => openDropdown('subfolder', sf, sf.parentFolder, e)}
                            className={cn(
                              'flex-shrink-0 w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 transition-opacity',
                              isSubActive ? 'hover:bg-white/20' : 'hover:bg-gray-200'
                            )}
                          >
                            <MoreHorizontal size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Portal dropdown — renders outside any overflow container */}
      {activeDropdown && typeof window !== 'undefined' && createPortal(
        <div
          style={{ position: 'fixed', top: activeDropdown.top, left: activeDropdown.left, zIndex: 9999 }}
          className="bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[150px]"
          onMouseDown={e => e.stopPropagation()}
        >
          {/* New Subfolder — available on all top-level folders */}
          {activeDropdown.type !== 'subfolder' && (
            <button
              onClick={() => {
                const d = activeDropdown;
                setActiveDropdown(null);
                onCreateSubfolder(d.parentFolderId);
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 w-full text-left"
            >
              <Plus size={11} /> New Subfolder
            </button>
          )}

          {/* Rename + Delete — all folders and subfolders */}
          {activeDropdown.type !== 'subfolder' && (
            <div className="mx-3 border-t border-gray-100 my-1" />
          )}
          <button
            onClick={() => {
              const d = activeDropdown;
              setActiveDropdown(null);
              if (d.type === 'section') onRenameSection(d.data as DocumentSection);
              else if (d.type === 'deptfolder') onRenameDeptFolder(d.data as FolderConfig);
              else if (d.type === 'fixed') onRenameFixedFolder(d.data as FolderConfig);
              else onRenameSubfolder(d.data as DocumentSubfolder);
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 w-full text-left"
          >
            <Pencil size={11} /> Rename
          </button>
          <button
            onClick={() => {
              const d = activeDropdown;
              setActiveDropdown(null);
              if (d.type === 'section') onDeleteSection(d.data as DocumentSection);
              else if (d.type === 'deptfolder') onDeleteDeptFolder(d.data as FolderConfig);
              else if (d.type === 'fixed') onDeleteFixedFolder(d.data as FolderConfig);
              else onDeleteSubfolder(d.data as DocumentSubfolder);
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50 w-full text-left"
          >
            <Trash2 size={11} /> Delete
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ── Rename Fixed Folder Label Modal ──────────────────────────────────────────

function RenameFolderLabelModal({
  folderId,
  currentLabel,
  onClose,
}: {
  folderId: string;
  currentLabel: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentLabel);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentLabel) { onClose(); return; }
    setSaving(true);
    try {
      await setDoc(doc(db, 'folder_settings', folderId), { label: trimmed }, { merge: true });
      toast.success('Folder renamed');
      onClose();
    } catch {
      toast.error('Failed to rename folder');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Rename Folder</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-4 py-2 bg-[#1B2B5E] text-white text-sm font-bold rounded-xl hover:bg-[#2D4080] disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Folder Modal ───────────────────────────────────────────────────────

function DeleteFolderModal({
  type,
  name,
  fileCount,
  onClose,
  onConfirm,
}: {
  type: 'section' | 'subfolder';
  name: string;
  fileCount: number;
  onClose: () => void;
  onConfirm: (action: 'move' | 'delete') => void;
}) {
  const [action, setAction] = useState<'move' | 'delete'>('move');
  const moveLabel = type === 'section' ? 'Move files to General' : 'Move files to parent folder';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Delete "{name}"</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {fileCount === 0 ? (
            <p className="text-sm text-gray-600">This folder is empty and will be permanently deleted.</p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                This folder contains <span className="font-semibold">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>. What should happen to them?
              </p>
              <div className="flex flex-col gap-2">
                <label
                  className={cn(
                    'flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors',
                    action === 'move' ? 'border-[#1B2B5E]/40 bg-slate-50' : 'border-gray-200 hover:border-[#1B2B5E]/30'
                  )}
                >
                  <input
                    type="radio"
                    name="deleteFolderAction"
                    value="move"
                    checked={action === 'move'}
                    onChange={() => setAction('move')}
                    className="mt-0.5 accent-[#1B2B5E]"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{moveLabel}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Files remain accessible</p>
                  </div>
                </label>
                <label
                  className={cn(
                    'flex items-start gap-3 cursor-pointer p-3 rounded-xl border transition-colors',
                    action === 'delete' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-red-200'
                  )}
                >
                  <input
                    type="radio"
                    name="deleteFolderAction"
                    value="delete"
                    checked={action === 'delete'}
                    onChange={() => setAction('delete')}
                    className="mt-0.5 accent-red-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Delete all files permanently</p>
                    <p className="text-xs text-gray-400 mt-0.5">This cannot be undone</p>
                  </div>
                </label>
              </div>
            </>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-xl">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(fileCount === 0 ? 'move' : action)}
              className={cn(
                'px-4 py-2 text-sm font-bold rounded-xl transition-colors',
                action === 'delete' && fileCount > 0
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-[#1B2B5E] text-white hover:bg-[#2D4080]'
              )}
            >
              Delete Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDocumentsPage() {
  const { currentUser } = useAuth();

  // Navigation state
  const [selectedFolder, setSelectedFolder]     = useState<string>('all');
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders]   = useState<Set<string>>(new Set(['general']));

  // Data
  const [documents, setDocuments]           = useState<ShipmateDocument[]>([]);
  const [subfolders, setSubfolders]         = useState<DocumentSubfolder[]>([]);
  const [deptFolders, setDeptFolders]       = useState<FolderConfig[]>([]);
  const [docSections, setDocSections]       = useState<DocumentSection[]>([]);
  const [allUsers, setAllUsers]             = useState<ShipmateUser[]>([]);
  const [fixedFolderLabels, setFixedFolderLabels] = useState<Record<string, string>>({});

  // UI state
  const [search, setSearch]         = useState('');
  const [sortBy, setSortBy]         = useState<SortOption>('newest');
  const [viewMode, setViewMode]     = useState<ViewMode>('grid');
  const [showUpload, setShowUpload] = useState(false);

  // Modal state
  const [subfolderModal, setSubfolderModal] = useState<{
    mode: 'create' | 'rename';
    parentFolderId: string;
    subfolder?: DocumentSubfolder;
  } | null>(null);
  const [sectionModal, setSectionModal] = useState<{ existing?: DocumentSection } | null>(null);
  const [renameFile, setRenameFile] = useState<{ id: string; name: string } | null>(null);
  const [moveFile, setMoveFile]     = useState<string | null>(null); // file id
  const [deleteFolderModal, setDeleteFolderModal] = useState<{
    type: 'section' | 'deptfolder' | 'subfolder';
    data: DocumentSection | DocumentSubfolder | FolderConfig;
    fileCount: number;
  } | null>(null);
  const [deptFolderRename, setDeptFolderRename]     = useState<FolderConfig | null>(null);
  const [fixedFolderRename, setFixedFolderRename]   = useState<FolderConfig | null>(null);

  const FIXED_IDS = new Set(FIXED_FOLDERS.map(f => f.id));

  // ── Firestore listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    // Departments
    const unsub = onSnapshot(collection(db, 'departments'), snap => {
      const folders: FolderConfig[] = snap.docs
        .filter(d => !FIXED_IDS.has(d.id))
        .map(d => ({ id: d.id, label: d.data().name as string, isDynamic: true }))
        .sort((a, b) => a.label.localeCompare(b.label));
      setDeptFolders(folders);
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Document sections (custom top-level folders)
    const unsub = onSnapshot(collection(db, 'document_sections'), snap => {
      const secs: DocumentSection[] = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<DocumentSection, 'id'>) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setDocSections(secs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Subfolders
    const unsub = onSnapshot(collection(db, 'document_folders'), snap => {
      const sfs: DocumentSubfolder[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<DocumentSubfolder, 'id'>),
      }));
      setSubfolders(sfs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Documents
    const unsub = onSnapshot(collection(db, 'documents'), snap => {
      const docs: ShipmateDocument[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<ShipmateDocument, 'id'>),
      }));
      setDocuments(docs);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // All users for upload tagging
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      const users: ShipmateUser[] = snap.docs.map(d => ({
        uid: d.id,
        ...(d.data() as Omit<ShipmateUser, 'uid'>),
      }));
      setAllUsers(users.sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Custom labels for fixed folders
    const unsub = onSnapshot(collection(db, 'folder_settings'), snap => {
      const labels: Record<string, string> = {};
      snap.docs.forEach(d => { labels[d.id] = d.data().label as string; });
      setFixedFolderLabels(labels);
    });
    return () => unsub();
  }, []);

  // ── Folder config ────────────────────────────────────────────────────────────

  const customSectionFolders: FolderConfig[] = docSections.map(s => ({
    id: s.id,
    label: s.name,
    isDynamic: true,
  }));

  const allFolders: FolderConfig[] = [
    { id: 'all', label: 'All Documents' },
    ...FIXED_FOLDERS.map(f => ({ ...f, label: fixedFolderLabels[f.id] ?? f.label })),
    ...deptFolders,
    ...customSectionFolders,
  ];

  // ── Navigation helpers ───────────────────────────────────────────────────────

  function handleSelectFolder(id: string) {
    setSelectedFolder(id);
    setSelectedSubfolder(null);
    setSearch('');
  }

  function handleSelectSubfolder(id: string) {
    setSelectedSubfolder(id);
    setSearch('');
  }

  function toggleExpand(id: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Subfolder actions ────────────────────────────────────────────────────────

  function handleDeleteSubfolder(sf: DocumentSubfolder) {
    const fileCount = documents.filter(d => d.subfolderId === sf.id).length;
    setDeleteFolderModal({ type: 'subfolder', data: sf, fileCount });
  }

  // ── Section actions ──────────────────────────────────────────────────────────

  function handleDeleteSection(section: DocumentSection) {
    const fileCount = documents.filter(d => d.folder === section.id).length;
    setDeleteFolderModal({ type: 'section', data: section, fileCount });
  }

  // ── Dept folder actions ──────────────────────────────────────────────────────

  function handleRenameDeptFolder(folder: FolderConfig) {
    setDeptFolderRename(folder);
  }

  function handleDeleteDeptFolder(folder: FolderConfig) {
    const fileCount = documents.filter(d => d.folder === folder.id).length;
    setDeleteFolderModal({ type: 'deptfolder', data: folder, fileCount });
  }

  // ── Fixed folder actions ─────────────────────────────────────────────────────

  function handleRenameFixedFolder(folder: FolderConfig) {
    setFixedFolderRename(folder);
  }

  function handleDeleteFixedFolder(_folder: FolderConfig) {
    toast.error('System folders (General, HR, Finance, Leave Documents) cannot be deleted.');
  }

  // ── Delete folder confirm ────────────────────────────────────────────────────

  function handleDeleteFolderConfirm(action: 'move' | 'delete') {
    if (!deleteFolderModal) return;
    const { type, data } = deleteFolderModal;
    setDeleteFolderModal(null);
    doDeleteFolder(type, data, action);
  }

  async function doDeleteFolder(
    type: 'section' | 'deptfolder' | 'subfolder',
    data: DocumentSection | DocumentSubfolder | FolderConfig,
    action: 'move' | 'delete'
  ) {
    try {
      if (type === 'subfolder') {
        const sf = data as DocumentSubfolder;
        const docsInSf = documents.filter(d => d.subfolderId === sf.id);
        if (docsInSf.length > 0) {
          if (action === 'delete') {
            for (const d of docsInSf) {
              if (d.storagePath) await storageService.deleteFile(d.storagePath);
            }
            const batch = writeBatch(db);
            docsInSf.forEach(d => batch.delete(doc(db, 'documents', d.id!)));
            await batch.commit();
          } else {
            const batch = writeBatch(db);
            docsInSf.forEach(d => batch.update(doc(db, 'documents', d.id!), { subfolderId: null }));
            await batch.commit();
          }
        }
        await deleteDoc(doc(db, 'document_folders', sf.id));
        toast.success(`Subfolder "${sf.name}" deleted`);
        if (selectedSubfolder === sf.id) setSelectedSubfolder(null);
      } else if (type === 'section') {
        const section = data as DocumentSection;
        const docsSnap = await getDocs(query(collection(db, 'documents'), where('folder', '==', section.id)));
        const batch = writeBatch(db);
        if (action === 'delete') {
          for (const d of docsSnap.docs) {
            const docData = d.data() as ShipmateDocument;
            if (docData.storagePath) await storageService.deleteFile(docData.storagePath);
            batch.delete(d.ref);
          }
        } else {
          docsSnap.docs.forEach(d => batch.update(d.ref, { folder: 'general' }));
        }
        const sfSnap = await getDocs(query(collection(db, 'document_folders'), where('parentFolder', '==', section.id)));
        sfSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'document_sections', section.id));
        await batch.commit();
        if (selectedFolder === section.id) handleSelectFolder('all');
        toast.success(`Folder "${section.name}" deleted`);
      } else {
        // deptfolder
        const folder = data as FolderConfig;
        const docsSnap = await getDocs(query(collection(db, 'documents'), where('folder', '==', folder.id)));
        const batch = writeBatch(db);
        if (action === 'delete') {
          for (const d of docsSnap.docs) {
            const docData = d.data() as ShipmateDocument;
            if (docData.storagePath) await storageService.deleteFile(docData.storagePath);
            batch.delete(d.ref);
          }
        } else {
          docsSnap.docs.forEach(d => batch.update(d.ref, { folder: 'general' }));
        }
        const sfSnap = await getDocs(query(collection(db, 'document_folders'), where('parentFolder', '==', folder.id)));
        sfSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(doc(db, 'departments', folder.id));
        await batch.commit();
        if (selectedFolder === folder.id) handleSelectFolder('all');
        toast.success(`Folder "${folder.label}" deleted`);
      }
    } catch {
      toast.error('Failed to delete folder');
    }
  }

  // ── File actions ─────────────────────────────────────────────────────────────

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

  // ── Filter & sort ────────────────────────────────────────────────────────────

  const filteredDocuments = (() => {
    let docs = documents;

    // Filter by folder/subfolder
    if (selectedFolder === 'all') {
      // show all
    } else if (selectedSubfolder) {
      docs = docs.filter(d => d.subfolderId === selectedSubfolder);
    } else {
      docs = docs.filter(d => d.folder === selectedFolder);
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      docs = docs.filter(d => d.name.toLowerCase().includes(q));
    }

    // Sort
    docs = [...docs].sort((a, b) => {
      const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
      if (sortBy === 'newest') return tb - ta;
      if (sortBy === 'oldest') return ta - tb;
      if (sortBy === 'name-az') return a.name.localeCompare(b.name);
      if (sortBy === 'largest') return (b.size ?? 0) - (a.size ?? 0);
      if (sortBy === 'smallest') return (a.size ?? 0) - (b.size ?? 0);
      return tb - ta;
    });

    return docs;
  })();

  // When viewing a top-level folder (not subfolder, not "all"):
  // show subfolder cards first, then files without a subfolder
  const currentFolderSubs = selectedFolder !== 'all' && !selectedSubfolder
    ? subfolders.filter(sf => sf.parentFolder === selectedFolder)
    : [];

  const filesInCurrentView = selectedFolder !== 'all' && !selectedSubfolder
    ? filteredDocuments.filter(d => !d.subfolderId)
    : filteredDocuments;

  // File counts per subfolder for badges
  function subfolderFileCount(sfId: string): number {
    return documents.filter(d => d.subfolderId === sfId).length;
  }

  // ── Breadcrumb ───────────────────────────────────────────────────────────────

  const currentFolderLabel = allFolders.find(f => f.id === selectedFolder)?.label ?? selectedFolder;
  const currentSubfolderLabel = selectedSubfolder
    ? subfolders.find(sf => sf.id === selectedSubfolder)?.name ?? ''
    : null;

  // ── Upload folder context ────────────────────────────────────────────────────

  const uploadFolderId = selectedFolder === 'all' ? 'general' : selectedFolder;
  const uploadSubfolderId = selectedSubfolder;

  return (
    <div className="flex h-full overflow-hidden bg-gray-50">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <Sidebar
        allFolders={allFolders}
        subfolders={subfolders}
        docSections={docSections}
        selectedFolder={selectedFolder}
        selectedSubfolder={selectedSubfolder}
        expandedFolders={expandedFolders}
        onSelectFolder={handleSelectFolder}
        onSelectSubfolder={handleSelectSubfolder}
        onToggleExpand={toggleExpand}
        onCreateSubfolder={parentId => setSubfolderModal({ mode: 'create', parentFolderId: parentId })}
        onRenameSubfolder={sf => setSubfolderModal({ mode: 'rename', parentFolderId: sf.parentFolder, subfolder: sf })}
        onDeleteSubfolder={handleDeleteSubfolder}
        onCreateSection={() => setSectionModal({})}
        onRenameSection={s => setSectionModal({ existing: s })}
        onDeleteSection={handleDeleteSection}
        onRenameDeptFolder={handleRenameDeptFolder}
        onDeleteDeptFolder={handleDeleteDeptFolder}
        onRenameFixedFolder={handleRenameFixedFolder}
        onDeleteFixedFolder={handleDeleteFixedFolder}
      />

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <span>{currentFolderLabel}</span>
              {currentSubfolderLabel && (
                <>
                  <ChevronRight size={14} className="text-gray-400" />
                  <span>{currentSubfolderLabel}</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Secure storage · permission-based access</p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#1B2B5E] text-white rounded-xl text-sm font-bold hover:bg-[#2D4080] transition-colors"
          >
            <Plus size={15} /> Upload
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 flex items-center gap-3 flex-shrink-0 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-0 max-w-xs">
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

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name-az">Name A-Z</option>
            <option value="largest">Largest</option>
            <option value="smallest">Smallest</option>
          </select>

          {/* View toggle */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                'px-3 py-2 transition-colors',
                viewMode === 'grid' ? 'bg-[#1B2B5E] text-white' : 'text-gray-400 hover:bg-gray-50'
              )}
            >
              <Grid size={14} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                'px-3 py-2 transition-colors',
                viewMode === 'list' ? 'bg-[#1B2B5E] text-white' : 'text-gray-400 hover:bg-gray-50'
              )}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">

          {/* Subfolder cards (only when viewing a top-level folder) */}
          {currentFolderSubs.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Subfolders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {currentFolderSubs.map(sf => (
                  <button
                    key={sf.id}
                    onClick={() => { handleSelectSubfolder(sf.id); setExpandedFolders(prev => new Set([...prev, sf.parentFolder])); }}
                    className="flex flex-col items-start gap-2 p-3 bg-white border border-gray-100 rounded-2xl hover:shadow-md transition-shadow text-left"
                  >
                    <div className="w-10 h-10 bg-[#F5C518]/20 rounded-xl flex items-center justify-center">
                      <Folder size={20} className="text-[#F5C518]" />
                    </div>
                    <div className="w-full">
                      <p className="text-sm font-semibold text-gray-800 truncate">{sf.name}</p>
                      <p className="text-xs text-gray-400">{subfolderFileCount(sf.id)} file{subfolderFileCount(sf.id) !== 1 ? 's' : ''}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Files */}
          {filesInCurrentView.length === 0 && currentFolderSubs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
                <Folder size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500">{search ? 'No files match' : 'No files yet'}</p>
              <p className="text-xs text-gray-400 mt-1">
                {search ? 'Try a different search term.' : 'Click Upload to add files.'}
              </p>
            </div>
          ) : filesInCurrentView.length > 0 ? (
            <>
              {currentFolderSubs.length > 0 && (
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Files</p>
              )}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filesInCurrentView.map(d => (
                    <FileCard
                      key={d.id}
                      document={d}
                      subfolders={subfolders}
                      allFolders={allFolders}
                      onDelete={handleDelete}
                      onRename={(id, name) => setRenameFile({ id, name })}
                      onMove={id => setMoveFile(id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* List header */}
                  <div className="flex items-center gap-4 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    <span className="w-10 flex-shrink-0">Type</span>
                    <span className="flex-1">Name</span>
                    <span className="w-28 hidden md:block">Subfolder</span>
                    <span className="w-24 hidden lg:block">Uploader</span>
                    <span className="w-16 text-right hidden sm:block">Size</span>
                    <span className="w-20 text-right hidden md:block">Date</span>
                    <span className="w-7" />
                  </div>
                  {filesInCurrentView.map(d => (
                    <FileRow
                      key={d.id}
                      document={d}
                      subfolders={subfolders}
                      allFolders={allFolders}
                      onDelete={handleDelete}
                      onRename={(id, name) => setRenameFile({ id, name })}
                      onMove={id => setMoveFile(id)}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}

      {showUpload && currentUser && (
        <UploadModal
          folderId={uploadFolderId}
          subfolderId={uploadSubfolderId}
          currentUser={currentUser}
          allUsers={allUsers}
          onClose={() => setShowUpload(false)}
        />
      )}

      {subfolderModal && currentUser && (
        <SubfolderModal
          mode={subfolderModal.mode}
          parentFolderId={subfolderModal.parentFolderId}
          initialName={subfolderModal.subfolder?.name}
          userId={currentUser.uid}
          subfolderId={subfolderModal.subfolder?.id}
          onClose={() => setSubfolderModal(null)}
          onDone={() => {}}
        />
      )}

      {renameFile && (
        <RenameFileModal
          fileId={renameFile.id}
          currentName={renameFile.name}
          onClose={() => setRenameFile(null)}
        />
      )}

      {moveFile && (
        <MoveFileModal
          fileId={moveFile}
          allFolders={allFolders}
          subfolders={subfolders}
          onClose={() => setMoveFile(null)}
        />
      )}

      {sectionModal !== null && currentUser && (
        <SectionModal
          existing={sectionModal.existing}
          userId={currentUser.uid}
          onClose={() => setSectionModal(null)}
        />
      )}

      {deleteFolderModal && (
        <DeleteFolderModal
          type={deleteFolderModal.type}
          name={
            deleteFolderModal.type === 'deptfolder'
              ? (deleteFolderModal.data as FolderConfig).label
              : (deleteFolderModal.data as any).name
          }
          fileCount={deleteFolderModal.fileCount}
          onClose={() => setDeleteFolderModal(null)}
          onConfirm={handleDeleteFolderConfirm}
        />
      )}

      {deptFolderRename && currentUser && (
        <SectionModal
          existing={{ id: deptFolderRename.id, name: deptFolderRename.label, createdBy: '', createdAt: null }}
          userId={currentUser.uid}
          collectionName="departments"
          onClose={() => setDeptFolderRename(null)}
        />
      )}

      {fixedFolderRename && (
        <RenameFolderLabelModal
          folderId={fixedFolderRename.id}
          currentLabel={fixedFolderRename.label}
          onClose={() => setFixedFolderRename(null)}
        />
      )}
    </div>
  );
}
