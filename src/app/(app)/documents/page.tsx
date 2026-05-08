'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Upload, FolderOpen, File, FileText, FileImage,
  Download, Trash2, Search, X, ChevronRight,
  AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { useAuth } from '@/contexts/AuthContext';
import { useRole } from '@/hooks/useRole';
import { Avatar, Badge, EmptyState, Button } from '@/components/ui';
import { storageService } from '@/lib/services/storageService';
import { formatDate, formatFileSize, getDepartmentLabel } from '@/lib/utils/formatters';
import { cn } from '@/lib/utils/cn';
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, orderBy, serverTimestamp,
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
  color: string;
  allowedRoles: string[];
}

const FOLDERS: FolderConfig[] = [
  {
    id: 'general',
    label: 'General',
    description: 'Company-wide documents',
    icon: '📁',
    color: 'bg-blue-50 border-blue-200',
    allowedRoles: ['super_admin', 'hr_admin', 'manager', 'employee'],
  },
  {
    id: 'ai-team',
    label: 'AI Team',
    description: 'AI team resources',
    icon: '🤖',
    color: 'bg-purple-50 border-purple-200',
    allowedRoles: ['super_admin', 'hr_admin', 'manager', 'employee'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Marketing materials',
    icon: '📢',
    color: 'bg-orange-50 border-orange-200',
    allowedRoles: ['super_admin', 'hr_admin', 'manager', 'employee'],
  },
  {
    id: 'finance',
    label: 'Finance',
    description: 'Financial records (restricted)',
    icon: '💰',
    color: 'bg-green-50 border-green-200',
    allowedRoles: ['super_admin', 'hr_admin'],
  },
  {
    id: 'hr',
    label: 'HR',
    description: 'HR documents (restricted)',
    icon: '👥',
    color: 'bg-pink-50 border-pink-200',
    allowedRoles: ['super_admin', 'hr_admin'],
  },
];

// ── File icon helper ──────────────────────────────────────────────────────────

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return FileImage;
  if (type === 'application/pdf') return FileText;
  return File;
}

function getFileColor(type: string): string {
  if (type.startsWith('image/')) return 'text-blue-500';
  if (type === 'application/pdf') return 'text-red-500';
  if (type.includes('word')) return 'text-blue-600';
  if (type.includes('sheet') || type.includes('excel')) return 'text-green-600';
  return 'text-gray-500';
}

// ── Upload zone ───────────────────────────────────────────────────────────────

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
  const [progress, setProgress] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setUploading(true);
      let successCount = 0;

      for (const file of files) {
        try {
          setProgress(`Uploading ${file.name}…`);
          const { url, storagePath } = await storageService.uploadDocument(
            folderId,
            file,
            userId
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
            uploaderName: '',   // filled server-side or via user lookup
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
        'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
        isDragActive
          ? 'border-[#1B2B5E] bg-[#1B2B5E]/5'
          : 'border-gray-200 hover:border-[#1B2B5E]/40 hover:bg-gray-50'
      )}
    >
      <input {...getInputProps()} />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-[#1B2B5E] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">{progress}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload size={24} className="text-gray-400" />
          <p className="text-sm font-medium text-gray-700">
            {isDragActive ? 'Drop files here' : 'Drag & drop or click to upload'}
          </p>
          <p className="text-xs text-gray-400">PDF, Word, Excel, images, ZIP · Max 10 MB</p>
        </div>
      )}
    </div>
  );
}

// ── Document row ──────────────────────────────────────────────────────────────

function DocumentRow({
  doc: docItem,
  canDelete,
  onDelete,
}: {
  doc: ShipmateDocument;
  canDelete: boolean;
  onDelete: (id: string, storagePath: string) => void;
}) {
  const FileIcon = getFileIcon(docItem.fileType ?? '');
  const iconColor = getFileColor(docItem.fileType ?? '');

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl group transition-colors">
      <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-100">
        <FileIcon size={18} className={iconColor} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{docItem.name}</p>
        <p className="text-xs text-gray-400">
          {formatFileSize(docItem.size ?? 0)} · {formatDate(docItem.createdAt as any)}
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <a
          href={docItem.downloadURL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-[#1B2B5E]"
          title="Download"
        >
          <Download size={14} />
        </a>
        {canDelete && (
          <button
            onClick={() => onDelete(docItem.id!, docItem.storagePath ?? '')}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500"
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const { currentUser } = useAuth();
  const { isHRorAdmin, isAdmin, can } = useRole();

  const [selectedFolder, setSelectedFolder] = useState<string>('general');
  const [documents, setDocuments] = useState<ShipmateDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const accessibleFolders = FOLDERS.filter(f =>
    f.allowedRoles.includes(currentUser?.role ?? 'employee')
  );

  const loadDocuments = useCallback(async () => {
    if (!selectedFolder) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'documents'),
        where('folder', '==', selectedFolder),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setDocuments(snap.docs.map(d => ({ id: d.id, ...d.data() } as ShipmateDocument)));
    } catch (err) {
      console.error(err);
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
  const canUpload = isHRorAdmin || ['general', 'ai-team', 'marketing'].includes(selectedFolder);
  const canDelete = isAdmin;

  return (
    <div className="flex h-full max-h-[calc(100vh-4rem)] md:max-h-screen">

      {/* ── Folder sidebar ─────────────────────────────────────── */}
      <div className="w-52 flex-shrink-0 border-r border-gray-100 bg-gray-50/50 p-3 hidden md:flex flex-col gap-1">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">
          Folders
        </p>
        {accessibleFolders.map(folder => (
          <button
            key={folder.id}
            onClick={() => setSelectedFolder(folder.id)}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-medium transition-all text-left',
              selectedFolder === folder.id
                ? 'bg-[#1B2B5E] text-white'
                : 'text-gray-700 hover:bg-white hover:shadow-sm'
            )}
          >
            <span className="text-base">{folder.icon}</span>
            <span className="truncate">{folder.label}</span>
            {(folder.id === 'finance' || folder.id === 'hr') && (
              <span className="ml-auto text-[9px] opacity-60">🔒</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Main content ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Mobile folder pills */}
        <div className="flex gap-2 overflow-x-auto p-3 pb-0 md:hidden no-scrollbar">
          {accessibleFolders.map(f => (
            <button
              key={f.id}
              onClick={() => setSelectedFolder(f.id)}
              className={cn(
                'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all',
                selectedFolder === f.id
                  ? 'bg-[#1B2B5E] text-white'
                  : 'bg-white text-gray-600 border border-gray-200'
              )}
            >
              <span>{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        <div className="p-4 md:p-5 flex-1 overflow-y-auto space-y-4">

          {/* Header */}
          <div className="flex items-center gap-2">
            <span className="text-xl">{currentFolder?.icon}</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{currentFolder?.label}</h1>
              <p className="text-xs text-gray-400">{currentFolder?.description}</p>
            </div>
          </div>

          {/* Upload zone */}
          {canUpload && currentUser && (
            <UploadZone
              folderId={selectedFolder}
              onUploaded={loadDocuments}
              userId={currentUser.uid}
            />
          )}

          {/* Search */}
          {documents.length > 0 && (
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search files…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B2B5E]/15 focus:border-[#1B2B5E]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
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
                  <div className="w-9 h-9 rounded-lg shimmer" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-48 rounded shimmer" />
                    <div className="h-2.5 w-24 rounded shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<FolderOpen size={24} />}
              title={search ? 'No files match' : 'No files yet'}
              description={
                search
                  ? 'Try a different search term.'
                  : canUpload
                  ? 'Upload files using the area above.'
                  : 'No documents have been uploaded here yet.'
              }
              action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
              {filtered.map(d => (
                <DocumentRow
                  key={d.id}
                  doc={d}
             