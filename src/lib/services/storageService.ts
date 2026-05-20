/**
 * storageService.ts
 *
 * All uploads use the Firebase Storage SDK (uploadBytesResumable) directly
 * from the browser.
 *
 * The SDK is whitelisted by Firebase's own CORS policy on
 * firebasestorage.googleapis.com.  The resumable session redirect goes to
 * storage.googleapis.com — that endpoint requires cors.json to be applied to
 * the GCS bucket (done via: gsutil cors set cors.json gs://BUCKET_NAME).
 */

import {
  ref, getDownloadURL, deleteObject, uploadBytesResumable,
} from 'firebase/storage';
import { storage } from '@/lib/firebase/config';

// ── Size limits ────────────────────────────────────────────────────────────────

const MAX_DOCUMENT_SIZE   = 500 * 1024 * 1024; // 500 MB
const MAX_ATTACHMENT_SIZE =  50 * 1024 * 1024; //  50 MB

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

// ── Extension → MIME fallback ─────────────────────────────────────────────────
// Some browsers (especially Windows) leave file.type blank for common formats.

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

// ── Core upload ───────────────────────────────────────────────────────────────
//
// Uses uploadBytesResumable which the Firebase SDK routes through
// firebasestorage.googleapis.com (Firebase-managed CORS, always allowed).
// The resumable data transfer then goes to storage.googleapis.com —
// that hop requires cors.json applied to the GCS bucket via gsutil.

function directUpload(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const storageRef  = ref(storage, path);
  const contentType = effectiveMime(file) || 'application/octet-stream';

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType });

    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error(
        'Upload timed out. '
        + 'Make sure CORS is applied to your bucket: '
        + 'gsutil cors set cors.json gs://gemini-enterprise-481717.firebasestorage.app',
      ));
    }, 120_000);

    uploadTask.on(
      'state_changed',
      snapshot => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      error => {
        clearTimeout(timeout);
        const friendly: Record<string, string> = {
          'storage/unauthorized':
            'Upload blocked by Storage rules — run: firebase deploy --only storage',
          'storage/canceled':
            'Upload cancelled.',
          'storage/unknown':
            'Network / CORS error — make sure CORS is applied: '
            + 'gsutil cors set cors.json gs://gemini-enterprise-481717.firebasestorage.app',
          'storage/quota-exceeded':
            'Firebase Storage quota exceeded.',
          'storage/retry-limit-exceeded':
            'Upload failed after retries. Check your connection and CORS config.',
        };
        reject(new Error(friendly[error.code] ?? `Upload failed: ${error.message}`));
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
    const { url } = await directUpload(path, compressed);
    return url;
  },

  // ── Chat attachment ─────────────────────────────────────────────────────────

  async uploadChatAttachment(
    channelId: string,
    messageId: string,
    file: File,
  ): Promise<{ url: string; name: string; size: number; type: string; storagePath: string }> {
    validateFile(file, MAX_ATTACHMENT_SIZE);
    const path = `chat-attachments/${channelId}/${messageId}/${file.name}`;
    const { url, storagePath } = await directUpload(path, file);
    return { url, name: file.name, size: file.size, type: file.type, storagePath };
  },

  // ── Long message text ───────────────────────────────────────────────────────

  async uploadLongMessage(channelId: string, messageId: string, content: string): Promise<string> {
    const path = `long-messages/${channelId}/${messageId}/content.md`;
    const storageRef = ref(storage, path);
    const { url: _url, storagePath } = await directUpload(
      path,
      new File([content], 'content.md', { type: 'text/markdown' }),
    );
    void _url;
    return storagePath;
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
    return directUpload(path, file, onProgress);
  },

  // ── Attendance photo ───────────────────────────────────────────────────────

  async uploadAttendancePhoto(
    uid: string,
    date: string,
    type: 'in' | 'out',
    blob: Blob,
  ): Promise<string> {
    // Wrap blob as File so compressImage can inspect type/name
    const raw = new File([blob], `${date}_${type}.jpg`, { type: 'image/jpeg' });
    // Compress to ≤1 MB so we stay well under the 5 MB storage rule limit
    const compressed = await storageService.compressImage(raw, 1);
    const path = `attendance-photos/${uid}/${date}_${type}.jpg`;
    const { url } = await directUpload(path, compressed);
    return url;
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
