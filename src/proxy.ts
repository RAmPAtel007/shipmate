import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/clockii',
  '/_next',
  '/api',
  '/icons',
  '/manifest.json',
  '/sw.js',
  '/workbox-',
  '/favicon.ico',
];

const APP_ROOT_PATHS = ['/home', '/chat', '/leaves', '/people', '/documents', '/settings', '/announcements'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const session = request.cookies.get('shipmate_session')?.value;
  const isAdmin = request.cookies.get('shipmate_admin')?.value === '1';

  // Root: Clockii marketing landing.
  // Logged-out visitors see the landing page (no redirect).
  // Logged-in users skip the marketing and jump straight to their dashboard.
  if (pathname === '/') {
    if (session) {
      return NextResponse.redirect(new URL(isAdmin ? '/admin' : '/home', request.url));
    }
    return NextResponse.next();
  }

  // Protect /admin routes — require session + admin cookie
  if (pathname.startsWith('/admin')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Note: full role check happens client-side in admin layout
    return NextResponse.next();
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
    return NextResponse.redirect(new URL(isAdmin ? '/admin' : '/home', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.ico).*)',
  ],
};
