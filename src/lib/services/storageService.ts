/**
 * storageService.ts
 *
 * Upload strategy:
 *
 *  Files ≤ 10 MB  → REST multipart upload directly to firebasestorage.googleapis.com
 *                   Firebase manages CORS on this endpoint natively — no bucket
 *                   CORS configuration required, no session-URI redirect.
 *
 *  Files  > 10 MB → uploadBytesResumable (Firebase SDK resumable API)
 *                   The resumable session redirects to storage.googleapis.com,
 *                   which requires cors.json applied to the bucket.
 *
 * The old /api/upload proxy route is no longer used.
 */

import { ref, getDownloadURL, deleteObject, uploadBytesResumable } from 'firebase/storage';
import { auth, storage } from '@/lib/firebase/config';

// ── Size limits ────────────────────────────────────────────────────────────────

const MAX_DOCUMENT_SIZE   = 500 * 1024 * 1024; // 500 MB
const MAX_ATTACHMENT_SIZE =  50 * 1024 * 1024; //  50 MB
const REST_THRESHOLD      =  10 * 1024 * 1024; //  10 MB — use REST API below this

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

// ── REST multipart upload (files ≤ 10 MB) ─────────────────────────────────────
//
// Uses uploadType=multipart on firebasestorage.googleapis.com — a single POST
// that never redirects to storage.googleapis.com. Firebase has CORS open on
// this endpoint for all browser origins, so no bucket CORS setup is needed.

async function restMultipartUpload(
  path: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in. Please refresh and try again.');
  const token = await user.getIdToken();

  const bucket       = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';
  const downloadToken = globalThis.crypto.randomUUID();
  const boundary     = `fb${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

  const metaJson = JSON.stringify({
    contentType,
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });

  const enc         = new TextEncoder();
  const metaPart    = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}`
    + `\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const closingPart = enc.encode(`\r\n--${boundary}--`);
  const fileBuffer  = await file.arrayBuffer();

  const body = new Uint8Array(metaPart.byteLength + fileBuffer.byteLength + closingPart.byteLength);
  body.set(metaPart, 0);
  body.set(new Uint8Array(fileBuffer), metaPart.byteLength);
  body.set(closingPart, metaPart.byteLength + fileBuffer.byteLength);

  onProgress?.(20);

  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`
    + `?uploadType=multipart&name=${encodeURIComponent(path)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => `HTTP ${res.status}`);
    // Surface human-friendly messages for common errors
    if (res.status === 403) {
      throw new Error(
        'Upload blocked by Firebase Storage rules. '
        + 'Run: firebase deploy --only storage',
      );
    }
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  onProgress?.(100);

  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`
            + `/${encodeURIComponent(path)}?alt=media&token=${downloadToken}`;

  return { url, storagePath: path };
}

// ── Resumable upload (files > 10 MB) ─────────────────────────────────────────
//
// Uses Firebase SDK uploadBytesResumable with progress tracking.
// Requires cors.json applied to the bucket (see project README).

function resumableUpload(
  path: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const storageRef = ref(storage, path);

  return new Promise((resolve, reject) => {
    const uploadTask = uploadBytesResumable(storageRef, file, { contentType });

    const timeout = setTimeout(() => {
      uploadTask.cancel();
      reject(new Error(
        'Upload timed out. Large-file uploads require CORS on the bucket — '
        + 'run: gsutil cors set cors.json gs://YOUR_BUCKET_NAME',
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
            'Upload blocked — run: firebase deploy --only storage',
          'storage/canceled':             'Upload cancelled.',
          'storage/unknown':
            'CORS error — run: gsutil cors set cors.json gs://YOUR_BUCKET_NAME',
          'storage/quota-exceeded':       'Firebase Storage quota exceeded.',
          'storage/retry-limit-exceeded': 'Upload failed after retries.',
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

// ── Unified upload dispatcher ─────────────────────────────────────────────────

async function directUpload(
  path: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ url: string; storagePath: string }> {
  const contentType = effectiveMime(file) || 'application/octet-stream';
  return file.size <= REST_THRESHOLD
    ? restMultipartUpload(path, file, contentType, onProgress)
    : resumableUpload(path, file, contentType, onProgress);
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
    const user = auth.currentUser;
    if (!user) throw new Error('Not signed in.');
    const token = await user.getIdToken();
    const path  = `long-messages/${channelId}/${messageId}/content.md`;
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';

    const res = await fetch(
      `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(path)}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/markdown' },
        body: content,
      },
    );
    if (!res.ok) throw new Error(`Failed to store long message (${res.status})`);
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
