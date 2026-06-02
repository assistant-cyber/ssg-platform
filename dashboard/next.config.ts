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
};

export default nextConfig;
