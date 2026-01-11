/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React 19 features
  reactStrictMode: true,

  // Custom server support for Socket.io integration
  // Note: We use a custom server (server.ts) to integrate Socket.io with Next.js
  // This is required for real-time features (QR code streaming, status updates)

  // Experimental features
  experimental: {
    // Enable Server Actions for Redis operations
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // TypeScript configuration
  typescript: {
    // Enforce type checking during build
    ignoreBuildErrors: false,
  },

  // ESLint configuration
  eslint: {
    // Enforce linting during build
    ignoreDuringBuilds: false,
  },

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_GATEWAY_URL:
      process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001',
    NEXT_PUBLIC_ORCHESTRATOR_URL:
      process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || 'http://localhost:3002',
  },

  // Production optimizations
  poweredByHeader: false,
  compress: true,

  // Logging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

module.exports = nextConfig;
