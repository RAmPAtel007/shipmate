/**
 * storageService.ts
 *
 * All uploads use the Firebase Storage SDK (uploadBytesResumable / uploadBytes)
 * directly from the browser. The Firebase SDK handles authentication and CORS
 * automatically — no server-side proxy is required.
 *
 * This works for both local development and static deployments (Firebase
 * Hosting with `next export`) because there is no server dependency.
 *
 * The /api/upload proxy route still exists but is no longer used by this
 * service. It can be removed in a future cleanup.
 */

import {
  ref, getDownloadURL, deleteObject,
  uploadBytes, uploadBytesResumable,
} from 'firebase/storage';
import { storage } from '@/lib/firebase/config';

// ── Size limits ────────────────────────────────────────────────────────────────

const MAX_DOCUMENT_SIZE  = 500 * 1024 * 1024; // 500 MB
const MAX_ATTACHMENT_SIZE =  50 * 1024 * 1024; // 50 MB

// ── Allowed MIME types ────────────────────────────────────────────────────────

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv',
  'application/zip', 'application/x-zip-compressed',
  'application/x-rar-compressed', 'application/x-7z-compressed',
  'application/json',
  'video/mp4', 'video/quicktime', 'video/webm',
  'audio/mpeg', 'audio/wav', 'audio/ogg',
]);

// ── Extension → MIME fallback (for browsers that don't set file.type) ─────────

const EXTENSION_MIME: Record<string, string> = {
  txt: 'text/plain',   md: 'text/markdown',   csv: 'text/csv',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',  json: 'application/json',
  jpg: 'image/jpeg',  jpeg: 'image/jpeg',  png: 'image/png',
  gif: 'image/gif',   webp: 'image/webp',  svg: 'image/svg+xml',
  mp4: 'video/mp4',   mov: 'video/quicktime', webm: 'video/webm',
  mp3: 'audio/mpeg',  wav: 'audio/wav',    ogg: 'audio/ogg',
};

/**
 * Returns the effective MIME type for a file.
 * Some browsers (especially on Windows) leave file.type blank for common
 * formats like .txt or .csv. We fall back to extension-based detection.
 */
function effectiveMime(file: File): string {
  if (file.type && ALLOWED_TYPES.has(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MIME[ext] ?? file.type;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFile(file: File, maxBytes = MAX_DOCUMENT_SIZE) {
  if (file.size > maxBytes) {
    const limitMB = (maxBytes / 1024 / 1024).toFixed(0);
    throw new Error(
      `File too large — maximum is ${limitMB} MB `
      + `(your file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    );
  }
  const mime = effectiveMime(file);
  if (!ALLOWED_TYPES.has(mime)) {
    const ext = file.name.split('.').pop()?.toUpperCase() ?? 'unknown';
    throw new Error(`File type not supported: .${ext} files`);
  }
}

/**
 * Upload directly to Firebase Storage via the resumable upload API.
 * Uses the Firebase SDK — no CORS configuration is needed for SDK uploads
 * once the bucket has CORS applied (see cors.json + deployment instructions).
 *
 * NOTE: Always pass `contentType` explicitly so that Firebase Storage security
 * rules' `isAllowedFileType()` check can evaluate `request.resource.contentType`.
 * If `file.type` is blank (common on Windows for .txt, .csv, etc.) the upload
 * would otherwise be denied as `storage/unauthorized`.
 */
function directUpload(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const storageRef = ref(storage, path);
  const contentType = effectiveMime(file) || 'application/octet-stream';

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType });

    // 90-second timeout — makes hangs visible instead of silently spinning
    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error(
        'Upload timed out — possible CORS issue. '
        + 'Run: gsutil cors set cors.json gs://YOUR_BUCKET_NAME',
      ));
    }, 90_000);

    uploadTask.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      error => {
        clearTimeout(timeout);
        const friendlyMessages: Record<string, string> = {
          'storage/unauthorized':
            'Upload blocked by Firebase Storage rules. '
            + 'Run: firebase deploy --only storage',
          'storage/canceled':             'Upload cancelled.',
          'storage/unknown':
            'Storage error (likely CORS). '
            + 'Run: gsutil cors set cors.json gs://YOUR_BUCKET_NAME',
          'storage/quota-exceeded':       'Firebase Storage quota exceeded.',
          'storage/retry-limit-exceeded': 'Upload failed after retries — check your connection.',
        };
        reject(new Error(friendlyMessages[error.code] ?? `Upload failed: ${error.message}`));
      },
      async () => {
        clearTimeout(timeout);
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          resolve({ url, storagePath: path });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          reject(new Error(`Failed to get download URL: ${msg}`));
        }
      },
    );
  });
}

// ── Public service ────────────────────────────────────────────────────────────

export const storageService = {

  // ── Avatar ─────────────────────────────────────────────────────────────────

  async uploadAvatar(uid: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Avatar must be an image.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Avatar must be under 2 MB.');

    const compressed = await storageService.compressImage(file, 0.5);
    const path = `avatars/${uid}/profile.jpg`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
    return getDownloadURL(storageRef);
  },

  // ── Chat attachment ─────────────────────────────────────────────────────────

  async uploadChatAttachment(
    channelId: string,
    messageId: string,
    file: File,
  ): Promise<{ url: string; name: string; size: number; type: string; storagePath: string }> {
    validateFile(file, MAX_ATTACHMENT_SIZE);
    const path = `chat-attachments/${channelId}/${messageId}/${file.name}`;

    // Use Firebase SDK directly — works in browser with no proxy or CORS setup needed.
    const { url, storagePath } = await directUpload(path, file);

    return { url, name: file.name, size: file.size, type: file.type, storagePath };
  },

  // ── Long message text ───────────────────────────────────────────────────────

  async uploadLongMessage(channelId: string, messageId: string, content: string): Promise<string> {
    const path = `long-messages/${channelId}/${messageId}/content.md`;
    const storageRef = ref(storage, path);
    const blob = new Blob([content], { type: 'text/markdown' });
    await uploadBytes(storageRef, blob, { contentType: 'text/markdown' });
    return path;
  },

  async getLongMessageContent(storagePath: string): Promise<string> {
    const storageRef = ref(storage, storagePath);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    return response.text();
  },

  // ── Document upload ─────────────────────────────────────────────────────────

  async uploadDocument(
    folder: string,
    file: File,
    _userId: string,
    onProgress?: (pct: number) => void,
  ): Promise<{ url: string; storagePath: string }> {
    validateFile(file);
    const path = `documents/${folder}/${Date.now()}_${file.name}`;

    // Use Firebase SDK directly — works in browser with no proxy or CORS setup needed.
    return directUpload(path, file, onProgress);
  },

  // ── Delete ──────────────────────────────────────────────────────────────────

  async deleteFile(storagePath: string): Promise<void> {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef).catch(() => {});
  },

  // ── Image compression ───────────────────────────────────────────────────────

  async compressImage(file: File, maxSizeMB = 1): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    if (file.size <= maxSizeMB * 1024 * 1024) return file;

    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }

      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_DIM = 1200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width  = Math.round(width  * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width  = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => resolve(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
          'image/jpeg',
          0.8,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
      img.src = objectUrl;
    });
  },
};
