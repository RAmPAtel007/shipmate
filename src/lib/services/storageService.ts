import {
  ref, uploadBytes, getDownloadURL, deleteObject,
  uploadBytesResumable, type StorageReference,
} from 'firebase/storage';
import { storage } from '@/lib/firebase/config';

// 500 MB for document uploads; 50 MB for chat attachments
const MAX_DOCUMENT_SIZE   = 500 * 1024 * 1024;
const MAX_ATTACHMENT_SIZE =  50 * 1024 * 1024;

const ALLOWED_TYPES = [
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
];

function validateFile(file: File, maxBytes = MAX_DOCUMENT_SIZE) {
  if (file.size > maxBytes) {
    const limitMB = (maxBytes / 1024 / 1024).toFixed(0);
    throw new Error(`File too large. Maximum size is ${limitMB} MB. (${(file.size / 1024 / 1024).toFixed(1)} MB uploaded)`);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error(`File type not allowed: ${file.type}`);
  }
}

export const storageService = {

  // ── Avatar upload ────────────────────────────────────────────────────────

  async uploadAvatar(uid: string, file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Avatar must be an image.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Avatar must be under 2 MB.');

    const compressed = await storageService.compressImage(file, 0.5);
    const storageRef = ref(storage, `avatars/${uid}/profile.jpg`);
    await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
    return getDownloadURL(storageRef);
  },

  // ── Chat attachment ──────────────────────────────────────────────────────

  async uploadChatAttachment(
    channelId: string,
    messageId: string,
    file: File
  ): Promise<{ url: string; name: string; size: number; type: string; storagePath: string }> {
    validateFile(file, MAX_ATTACHMENT_SIZE);
    const path = `chat-attachments/${channelId}/${messageId}/${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const url = await getDownloadURL(storageRef);
    return { url, name: file.name, size: file.size, type: file.type, storagePath: path };
  },

  // ── Long message text ────────────────────────────────────────────────────

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

  // ── Document upload ──────────────────────────────────────────────────────

  async uploadDocument(
    folder: string,
    file: File,
    userId: string,
    onProgress?: (pct: number) => void
  ): Promise<{ url: string; storagePath: string }> {
    validateFile(file);
    const timestamp = Date.now();
    const path = `documents/${folder}/${timestamp}_${file.name}`;
    const storageRef = ref(storage, path);

    return new Promise((resolve, reject) => {
      const uploadTask = uploadBytesResumable(storageRef, file, { contentType: file.type });

      // 90-second hard timeout — surfaces CORS / rules / network hangs
      const timeout = setTimeout(() => {
        uploadTask.cancel();
        reject(new Error(
          'Upload timed out. This is usually a CORS issue on the Firebase Storage bucket. ' +
          'Run: gcloud storage buckets update gs://YOUR_BUCKET --cors-file=cors.json ' +
          '(see cors.json in the project root). Also ensure all NEXT_PUBLIC_FIREBASE_* ' +
          'environment variables are set in your hosting platform dashboard.'
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
          // Map Firebase Storage error codes to human-readable messages
          const msg: Record<string, string> = {
            'storage/unauthorized':   'Upload blocked: check Firebase Storage rules.',
            'storage/canceled':        'Upload cancelled.',
            'storage/unknown':         'Unknown storage error. Check the browser console.',
            'storage/quota-exceeded':  'Firebase Storage quota exceeded.',
            'storage/retry-limit-exceeded': 'Upload failed after retries. Check your connection.',
          };
          reject(new Error(msg[error.code] ?? `Upload failed: ${error.message}`));
        },
        async () => {
          clearTimeout(timeout);
          try {
            const url = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ url, storagePath: path });
          } catch (err: any) {
            reject(new Error(`Failed to get download URL: ${err.message}`));
          }
        }
      );
    });
  },

  // ── Delete ───────────────────────────────────────────────────────────────

  async deleteFile(storagePath: string): Promise<void> {
    const storageRef = ref(storage, storagePath);
    await deleteObject(storageRef).catch(() => {}); // Silently ignore if already deleted
  },

  // ── Image compression ────────────────────────────────────────────────────

  async compressImage(file: File, maxSizeMB: number = 1): Promise<File> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
    if (file.size <= maxSizeMB * 1024 * 1024) return file;

    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(file);

      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX_DIM = 1200;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => {
            if (!blob) return resolve(file);
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.8
        );
      };

      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  },
};
