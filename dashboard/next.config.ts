import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@react-pdf/renderer'],
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'http', hostname: '192.168.*' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  // Raise the body size limit for API routes to handle phone camera photos.
  // Vercel's default is 4.5MB; phone photos can be 8–15MB.
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
};

export default nextConfig;

// build trigger
