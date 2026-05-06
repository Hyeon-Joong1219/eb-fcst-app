import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    domains: [],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
