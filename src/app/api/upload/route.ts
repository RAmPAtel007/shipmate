/**
 * /api/upload
 *
 * Server-side upload proxy — bypasses Firebase Storage CORS entirely.
 * The browser POSTs the file here (same origin, no CORS), and this
 * Edge function forwards it to Firebase Storage using the user's
 * Firebase Auth ID token.
 *
 * Supports files up to Vercel's Edge request limit (~4 MB per chunk).
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

  const encodedPath = encodeURIComponent(path);
  const uploadUrl   = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`
                    + `?uploadType=media&name=${encodedPath}`;

  let uploadRes: Response;
  try {
    uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Length': String(file.size),
      },
      // @ts-expect-error — duplex is needed for streaming request bodies
      duplex: 'half',
      body: file.stream(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Network error reaching Firebase Storage: ${msg}` }, { status: 502 });
  }

  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => '(no body)');
    return NextResponse.json(
      { error: `Firebase Storage rejected the upload (${uploadRes.status}): ${body}` },
      { status: uploadRes.status },
    );
  }

  const data = (await uploadRes.json()) as { downloadTokens?: string };
  const downloadToken = data.downloadTokens;

  if (!downloadToken) {
    return NextResponse.json(
      { error: 'Firebase Storage did not return a download token.' },
      { status: 500 },
    );
  }

  const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`
            + `/${encodedPath}?alt=media&token=${downloadToken}`;

  return NextResponse.json({ url, storagePath: path });
}
