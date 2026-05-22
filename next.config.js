/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Allow embedding inside shipcubeai.com only (iframe for HR section)
          { key: 'X-Frame-Options', value: 'ALLOW-FROM https://shipcubeai.com' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://shipcubeai.com https://*.shipcubeai.com" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // camera=(self) + geolocation=(self) — the app itself can request webcam and GPS
          // (used for attendance punch-in/out selfie + location capture).
          { key: 'Permissions-Policy', value: 'camera=(self "https://shipcubeai.com"), microphone=(), geolocation=(self "https://shipcubeai.com")' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
