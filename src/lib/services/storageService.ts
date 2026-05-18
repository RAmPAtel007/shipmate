/**
 * storageService.ts
 *
 * All uploads go through /api/upload (server-side proxy) to avoid Firebase
 * Storage CORS restrictions when running in the browser.
 *
 * Files larger than the Edge function limit (~4 MB) fall back to a direct
 * Firebase Storage upload via uploadBytesResumable, which requires CORS to
 * be configured on the bucket (see cors.json in the project root).
 */

import {
  ref, getDownloadURL, deleteObject,
  uploadBytes, uploadBytesResumable,
} from 'firebase/storage';
import { auth, storage } from '@/lib/firebase/config';

// ── Size limits ────────────────────────────────────────────────────────────────

/** Files at or below this threshold are uploaded via the /api/upload proxy. */
const PROXY_THRESHOLD    =   4 * 1024 * 1024; //  4 MB
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFile(file: File, maxBytes = MAX_DOCUMENT_SIZE) {
  if (file.size > maxBytes) {
    const limitMB = (maxBytes / 1024 / 1024).toFixed(0);
    throw new Error(
      `File too large — maximum is ${limitMB} MB `
      + `(your file is ${(file.size / 1024 / 1024).toFixed(1)} MB).`,
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(`File type not supported: ${file.type || '(unknown)'}`);
  }
}

/** Get the current user's Firebase Auth ID token (required for server proxy). */
async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in. Please refresh and try again.');
  return user.getIdToken();
}

/**
 * Upload via the /api/upload server-side proxy.
 * No CORS configuration required — the browser only talks to the same origin.
 */
async function proxyUpload(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const token = await getIdToken();

  const form = new FormData();
  form.append('file', file);
  form.append('path', path);
  form.append('token', token);

  // Simulate indeterminate progress while waiting for the server
  onProgress?.(15);

  const res = await fetch('/api/upload', { method: 'POST', body: form });

  onProgress?.(90);

  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: 'Upload failed' })) as { error?: string };
    throw new Error(payload.error ?? `Upload failed (HTTP ${res.status})`);
  }

  const data = await res.json() as { url: string; storagePath: string };
  onProgress?.(100);
  return { url: data.url, storagePath: data.storagePath };
}

/**
 * Upload directly to Firebase Storage via the resumable upload API.
 * Used for large files that exceed the Edge proxy limit.
 * Requires CORS to be configured on the bucket (see cors.json).
 */
function directUpload(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

    // 90-second timeout — makes hangs visible instead of silently spinning
    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error(
        'Upload timed out. For files over 4 MB, Firebase Storage CORS must be '
        + 'configured. Run the Cloud Shell command in your project README or '
        + 'apply cors.json to your storage bucket.',
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
          'storage/unauthorized':          'Upload blocked — check Firebase Storage security rules.',
          'storage/canceled':              'Upload cancelled.',
          'storage/unknown':               'Unknown storage error. Check the browser console.',
          'storage/quota-exceeded':        'Firebase Storage quota exceeded.',
          'storage/retry-limit-exceeded':  'Upload failed after retries — check your connection.',
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

    // Avatars are always small — use the proxy
    const { url } = await proxyUpload(path, compressed);
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

    // Small files → proxy (no CORS needed); large → direct (requires CORS)
    const { url, storagePath } = file.size <= PROXY_THRESHOLD
      ? await proxyUpload(path, file)
      : await directUpload(path, file);

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

    // Small files → proxy; large files → direct (requires CORS on the bucket)
    return file.size <= PROXY_THRESHOLD
      ? proxyUpload(path, file, onProgress)
      : directUpload(path, file, onProgress);
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
