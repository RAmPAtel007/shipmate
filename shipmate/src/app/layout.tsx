import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/contexts/AuthContext';
import './globals.css';

export const metadata: Metadata = {
  title: 'SHIPMATE — Shipcube',
  description: 'Shipcube Team Operating System — Chat, Leaves, People & Documents',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SHIPMATE',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#1B2B5E',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            gutter={8}
            toastOptions={{
              duration: 4000,
              style: {
                fontFamily: 'Inter, sans-serif',
                fontSize: '14px',
                maxWidth: '380px',
                borderRadius: '10px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              },
              success: {
                style: { background: '#10B981', color: 'white' },
                iconTheme: { primary: 'white', secondary: '#10B981' },
              },
              error: {
                style: { background: '#EF4444', color: 'white' },
                iconTheme: { primary: 'white', secondary: '#EF4444' },
              },
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
