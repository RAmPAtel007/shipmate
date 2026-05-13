'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Upload, FolderOpen, File, FileText, FileImage,
  Download, Trash2, Search, X,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { storageService } from '@/lib/services/storageService';
import { formatDate, formatFileSize } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ShipmateDocument, DocumentFolder } from '@/lib/types';
import toast from 'react-hot-toast';

// ── Folder config ─────────────────────────────────────────────────────────────

interface FolderConfig {
  id: string;
  label: string;
  description: string;
  icon: string;
}

const FOLDERS: FolderConfig[] = [
  { id: 'general',   label: 'General',    description: 'Company-wide documents',  icon: '📁' },
  { id: 'ai-team',   label: 'AI Team',    description: 'AI team resources',        icon: '🤖' },
  { id: 'marketing', label: 'Marketing',  description: 'Marketing materials',      icon: '📢' },
  { id: 'finance',   label: 'Finance',    description: 'Financial records',        icon: '💰' },
  { id: 'hr',        label: 'HR',         description: 'HR documents',             icon: '👥' },
];

// ── File icon helpers ─────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return FileImage;
  if (type === 'application/pdf') return FileText;
  return File;
}

function getFileExt(name: string, type: string): string {
  const ext = name.split('.').pop()?.toUpperCase();
  if (ext && ext.length <= 4) return ext;
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('image/')) return type.split('/')[1]?.toUpperCase() ?? 'IMG';
  return 'FILE';
}

// ── Upload zone (admin themed) ────────────────────────────────────────────────

function UploadZone({
  folderId,
  onUploaded,
  userId,
}: {
  folderId: string;
  onUploaded: () => void;
  userId: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; name: string; pct: number } | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[], rejectedFiles: any[]) => {
      if (rejectedFiles.length > 0) {
        const err = rejectedFiles[0].errors?.[0];
        if (err?.code === 'file-too-large') toast.error(`${rejectedFiles[0].file.name}: too large (max 10 MB)`);
        else if (err?.code === 'file-invalid-type') toast.error(`${rejectedFiles[0].file.name}: file type not allowed`);
        else toast.error(`${rejectedFiles[0].file.name}: rejected`);
      }
      if (!acceptedFiles.length) return;
      setUploading(true);
      let successCount = 0;

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        try {
          setProgress({ current: i + 1, total: acceptedFiles.length, name: file.name, pct: 0 });
          const { url, storagePath } = await storageService.uploadDocument(
            folderId, file, userId,
            pct => setProgress(p => p ? { ...p, pct } : null)
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
          successCount++;
        } catch (err: any) {
          toast.error(err.message ?? `Failed to upload ${file.name}`);
        }
      }

      setUploading(false);
      setProgress(null);
      if (successCount) {
        toast.success(`${successCount} file${successCount > 1 ? 's' : ''} uploaded`);
        onUploaded();
      }
    },
    [folderId, userId, onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: uploading,
    maxSize: 10 * 1024 * 1024,
    accept: {
      'image/*': [],
      'application/pdf': [],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [],
      'text/plain': [],
      'text/markdown': [],
      'application/zip': [],
    },
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        'border-2 border-dashed rounded-xl p-5 text-center transition-colors',
        uploading
          ? 'border-white/10 bg-white/3 cursor-default'
          : isDragActive
            ? 'border-[#F5C518] bg-[#F5C518]/5 cursor-copy'
            : 'border-white/15 hover:border-[#F5C518]/40 hover:bg-white/3 cursor-pointer'
      )}
    >
      <input {...getInputProps()} />
      {uploading && progress ? (
        <div className="flex flex-col items-center gap-3">
          <div className="w-full max-w-xs">
            <div className="flex items-center justify-between text-xs text-white/40 mb-1.5">
              <span className="truncate max-w-[200px]">{progress.name}</span>
              <span className="flex-shrink-0 ml-2 tabular-nums">
                {progress.total > 1 ? `${progress.current}/${progress.total} · ` : ''}{progress.pct}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F5C518] rounded-full transition-all duration-150"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-white/30">
            {progress.pct === 0 ? 'Starting upload…' : progress.pct < 100 ? 'Uploading…' : 'Saving…'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div className="w-9 h-9 bg-white/8 rounded-xl flex items-center justify-center mb-1">
            <Upload size={18} className={isDragActive ? 'text-[#F5C518]' : 'text-white/30'} />
          </div>
          <p className="text-sm font-semibold text-white/70">
            {isDragActive ? 'Drop files here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-white/30">PDF, Word, Excel, images, ZIP · Max 10 MB</p>
        </div>
      )}
    </div>
  );
}

// ── Document row (admin themed) ───────────────────────────────────────────────

function DocumentRow({
  docItem,
  onDelete,
}: {
  docItem: ShipmateDocument;
  onDelete: (id: string, storagePath: string) => void;
}) {
  const FileIcon = getFileIcon(docItem.fileType ?? '');
  const ext = getFileExt(docItem.name, docItem.fileType ?? '');

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-white/4 group transition-colors border-b border-white/6 last:border-0">
      <div className="w-10 h-10 bg-white/8 rounded-xl flex flex-col items-center justify-center flex-shrink-0">
        <FileIcon size={16} className="text-[#F5C518]/80" />
        <span className="text-[8px] font-bold mt-0.5 leading-none text-[#F5C518]/60">{ext}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white/85 truncate">{docItem.name}</p>
        <p className="text-xs text-white/35">
          {formatFileSize(docItem.size ?? 0)} · {formatDate(docItem.createdAt as any)}
          {docItem.uploaderName && ` · ${docItem.uploaderName}`}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={docItem.downloadURL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/30 hover:text-[#F5C518] transition-colors"
          title="Download"
        >
          <Download size={14} />
        </a>
        <button
          onClick={() => onDelete(docItem.id!, docItem.storagePath ?? '')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-500/15 text-white/30 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminDocumentsPage() {
  const { currentUser } = useAuth();

  const [selectedFolder, setSelectedFolder] = useState<string>('general');
  const [documents, setDocuments] = useState<ShipmateDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadDocuments = useCallback(async () => {
    if (!selectedFolder) return;
    setLoading(true);
    try {
      // No orderBy — avoids composite index requirement. Sort client-side.
      const q = query(
        collection(db, 'documents'),
        where('folder', '==', selectedFolder),
      );
      const snap = await getDocs(q);
      const docs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as ShipmateDocument))
        .sort((a, b) => {
          const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
          const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
          return tb - ta; // newest first
        });
      setDocuments(docs);
    } catch (err: any) {
      console.error('[AdminDocuments] loadDocuments error:', err);
      toast.error('Failed to load documents' + (err?.message ? `: ${err.message}` : ''));
    } finally {
      setLoading(false);
    }
  }, [selectedFolder]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

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

  const currentFolder = FOLDERS.find(f => f.id === selectedFolder);

  return (
    <div className="flex h-full overflow-hidden bg-gray-950">

      {/* Folder sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-white/8 bg-gray-900/50 p-3 flex flex-col gap-1">
        <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest px-2 mb-2">
          Folders
        </p>
        {FOLDERS.map(folder => {
          const isActive = selectedFolder === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => setSelectedFolder(folder.id)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left',
                isActive
                  ? 'bg-[#F5C518]/12 text-[#F5C518]'
                  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              )}
            >
              {isActive && <div className="absolute left-0 w-1 h-5 bg-[#F5C518] rounded-r-full" />}
              <span className="text-base">{folder.icon}</span>
              <span className="truncate">{folder.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-5 flex-1 overflow-y-auto space-y-4">

          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentFolder?.icon}</span>
            <div>
              <h1 className="text-lg font-bold text-white">{currentFolder?.label}</h1>
              <p className="text-xs text-white/35">{currentFolder?.description}</p>
            </div>
          </div>

          {/* Upload zone */}
          {currentUser && (
            <UploadZone
              folderId={selectedFolder}
              onUploaded={loadDocuments}
              userId={currentUser.uid}
            />
          )}

          {/* Search */}
          {documents.length > 0 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                type="text"
                placeholder="Search files…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-white/6 border border-white/10 rounded-xl text-sm text-white placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#F5C518]/20 focus:border-[#F5C518]/40"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60">
                  <X size={12} />
                </button>
              )}
            </div>
          )}

          {/* File list */}
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="w-10 h-10 rounded-xl bg-white/8 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 rounded bg-white/8 animate-pulse" />
                    <div className="h-2.5 w-24 rounded bg-white/6 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 bg-white/6 rounded-2xl flex items-center justify-center">
                <FolderOpen size={24} className="text-white/25" />
              </div>
              <p className="text-sm font-semibold text-white/50">
                {search ? 'No files match' : 'No files yet'}
              </p>
              <p className="text-xs text-white/25">
                {search ? 'Try a different search term.' : 'Upload files using the area above.'}
              </p>
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="text-xs text-[#F5C518]/70 hover:text-[#F5C518] font-medium"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="bg-white/4 rounded-2xl border border-white/8 overflow-hidden">
              {filtered.map(d => (
                <DocumentRow key={d.id} docItem={d} onDelete={handleDelete} />
              ))}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
