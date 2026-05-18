/**
 * /api/upload
 *
 * Server-side upload proxy — bypasses Firebase Storage CORS entirely.
 * The browser POSTs the file here (same origin, no CORS), and this
 * Edge function forwards it to Firebase Storage using the user's
 * Firebase Auth ID token.
 *
 * Uses a multipart/related upload so we can embed download-token metadata
 * in one round-trip — no dependency on the response including downloadTokens.
 *
 * Supports files up to ~4 MB (Vercel Edge request body limit).
 * For larger files the client falls back to direct Firebase Storage upload
 * (which requires CORS to be configured on the bucket).
 */

import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

const BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '';

export async function POST(req: NextRequest) {
  if (!BUCKET) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set on this server.' },
      { status: 500 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart/form-data body.' }, { status: 400 });
  }

  const file  = form.get('file')  as File   | null;
  const path  = form.get('path')  as string | null;
  const token = form.get('token') as string | null;

  if (!file || !path || !token) {
    return NextResponse.json(
      { error: '`file`, `path`, and `token` fields are all required.' },
      { status: 400 },
    );
  }

  // ── Build a multipart/related body ──────────────────────────────────────────
  // We generate our own download token so we can construct the URL without
  // relying on Firebase returning `downloadTokens` in the upload response.

  const downloadToken = globalThis.crypto.randomUUID();
  const contentType   = file.type || 'application/octet-stream';
  const boundary      = `fb${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;

  const metadataJson = JSON.stringify({
    contentType,
    metadata: { firebaseStorageDownloadTokens: downloadToken },
  });

  const enc         = new TextEncoder();
  const metaPart    = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const closingPart = enc.encode(`\r\n--${boundary}--`);
  const fileBuffer  = await file.arrayBuffer();

  const body = new Uint8Array(metaPart.byteLength + fileBuffer.byteLength + closingPart.byteLength);
  body.set(metaPart, 0);
  body.set(new Uint8Array(fileBuffer), metaPart.byteLength);
  body.set(closingPart, metaPart.byteLength + fileBuffer.byteLength);

  // ── Upload to Firebase Storage ───────────────────────────────────────────────

  const encodedPath = encodeURIComponent(path);
  const uploadUrl   = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`
                    + `?uploadType=multipart&name=${encodedPath}`;

  let uploadRes: Response;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Network error reaching Firebase Storage: ${msg}` },
      { status: 502 },
    );
  }

  if (!uploadRes.ok) {
    const responseBody = await uploadRes.text().catch(() => '(no body)');
    return NextResponse.json(
      { error: `Firebase Storage rejected the upload (${uploadRes.status}): ${responseBody}` },
      { status: uploadRes.status },
    );
  }

  // ── Build the authenticated download URL ────────────────────────────────────

  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`
            + `/${encodedPath}?alt=media&token=${downloadToken}`;

  return NextResponse.json({ url, storagePath: path });
}
