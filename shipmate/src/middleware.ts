import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * SHIPMATE Route Middleware
 *
 * Firebase Auth is client-side only — tokens live in IndexedDB/localStorage.
 * This middleware does a lightweight cookie pre-check; the real auth guard is
 * the AuthContext inside (app)/layout.tsx which awaits the Firebase SDK.
 *
 * The session cookie (shipmate_session) is set by auth.ts after Google sign-in
 * and cleared on sign-out. It's not cryptographically verified here — that's
 * Firebase's job — but it prevents the UI flash of the wrong page.
 */

const PUBLIC_PATHS = [
  '/login',
  '/_next',
  '/api',
  '/icons',
  '/manifest.json',
  '/sw.js',
  '/workbox-',
  '/favicon.ico',
];

const APP_ROOT_PATHS = ['/home', '/chat', '/leaves', '/people', '/documents', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always allow public/static paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get('shipmate_session')?.value;

  // Root redirect
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(session ? '/home' : '/login', request.url)
    );
  }

  // Protect app routes
  if (APP_ROOT_PATHS.some(p => pathname.startsWith(p))) {
    if (!session) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Already authenticated — don't show login page
  if (pathname.startsWith('/login') && session) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match everything except Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)',
  ],
};
