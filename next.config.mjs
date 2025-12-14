import createMDX from '@next/mdx';
import withPWA from 'next-pwa';

import { buildCspHeader } from './csp.config.mjs';

// --- 🔧 Bundle Analyzer (Safe Dynamic Import) ---
let withBundleAnalyzer = (config) => config;

if (process.env.ANALYZE === 'true') {
  try {
    const { default: withAnalyzer } = await import('@next/bundle-analyzer');
    withBundleAnalyzer = withAnalyzer({
      enabled: true,
      // Explicitly set analyzer port to avoid conflicts
      openAnalyzer: false,
      analyzerMode: 'static',
      reportFilename: 'bundle-report.html',
    });
  } catch (e) {
    console.warn('[ANALYZE] Failed to load @next/bundle-analyzer:', e.message);
  }
}

// --- 🛡️ PWA Configuration (Optimized for Size & Safety) ---
const withPwa = withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',

  // ⚠️ CRITICAL: Exclude ALL webpack cache, server chunks, sourcemaps
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,
    /server\/.*\.js$/,
    /server\/.*\.js\.map$/,
    /static\/chunks\/pages\/_app.*\.js\.map$/,
    /static\/chunks\/pages\/_error.*\.js\.map$/,
    /static\/chunks\/pages\/_document.*\.js\.map$/,
    /static\/chunks\/pages\/_not-found.*\.js\.map$/,
    /static\/chunks\/pages\/.*\.js\.map$/,
    /static\/chunks\/.*\.js\.map$/,
    /static\/chunks\/.*\.css\.map$/,
  ],

  // ✅ Only precache essential static assets — NO JS bundles!
  // This prevents 129MiB 0.pack from being cached or uploaded
  precacheEntries: [
    { url: '/_next/static/chunks/main-app.js', revision: null },
    { url: '/_next/static/chunks/runtime-*', revision: null },
    { url: '/_next/static/chunks/pages/_app-*.js', revision: null },
    { url: '/_next/static/chunks/pages/index-*.js', revision: null },
  ],

  // ✅ Runtime caching — strict & scoped
  runtimeCaching: [
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/version.*$/,
      handler: 'NetworkOnly',
      options: { cacheName: 'version-check' },
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/(.*\.(png|jpg|jpeg|gif|webp|avif|svg))$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'images',
        expiration: { maxEntries: 150, maxAgeSeconds: 2592000 },
      },
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/_next\/static\/chunks\/.*\.js$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'js-chunks',
        expiration: { maxEntries: 100, maxAgeSeconds: 86400 }, // 1 day
      },
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/_next\/static\/css\/.*\.css$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'css-chunks',
        expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
      },
    },
    {
      urlPattern: /^https?:\/\/[^/]+\/api\/.*$/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 50, maxAgeSeconds: 300 }, // 5 min
      },
    },
  ],

  // ✅ Public excludes — prevent sw.js pollution
  publicExcludes: [
    '!version.json',
    '!noprecache/**/*',
    '!sw.js',
    '!workbox-*.js',
    '!manifest.webmanifest',
  ],

  fallbacks: {
    document: '/offline/',
  },
});

// --- 📝 MDX Configuration (Modern & Secure) ---
const withMDX = createMDX({
  extension: /\.mdx?$/,
  options: {
    // ✅ Use remark-gfm safely — no duplicate plugin registration
    remarkPlugins: [
      // Already built-in in @next/mdx@v15+; explicit only if needed
      ...(process.env.MDX_ENABLE_GFM !== '0' ? ['remark-gfm'] : []),
      // Optional: add syntax highlighting if needed later
      // require('remark-shiki')
    ],
    rehypePlugins: [],
  },
});

// --- 🌐 Vercel Analytics Toggle ---
const shouldIncludeVercelAnalytics = () => {
  const override = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS;
  if (override === '0') return false;
  if (override === '1') return true;
  return process.env.VERCEL === '1' && process.env.NODE_ENV === 'production';
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ CRITICAL: Enforce output directory to avoid .next/cache upload
  distDir: 'out',

  // ✅ Prevent webpack cache explosion (disable persistent caching)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };

      // ⚠️ Disable webpack persistent cache to prevent 0.pack bloat
      config.cache = false;

      // ✅ Enable SWC minification (smaller, faster than Terser)
      config.optimization.minimizer = [
        new (require('next/dist/build/webpack/plugins/swc-minifier-plugin').SwcMinifyPlugin)(),
      ];
    }
    return config;
  },

  // ✅ Safe optimization flags
  experimental: {
    optimizePackageImports: ['react-icons', 'lucide-react'],
    esmExternals: true,
    outputFileTracing: true,
  },

  // ✅ Core config
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  typescript: {
    ignoreBuildErrors: !!process.env.NEXT_PUBLIC_DISABLE_ARTICLES,
  },
  env: {
    NEXT_PUBLIC_BUILD_TIMESTAMP: new Date().toISOString(),
  },

  // ✅ Rewrites — unchanged but kept clean
  async rewrites() {
    const rewriteContents = [
      { source: '/version.json', destination: '/api/version' },
    ];

    if (process.env.NEXT_PUBLIC_DISABLE_ARTICLES) {
      rewriteContents.push(
        { source: '/api/articles', destination: '/404' },
        { source: '/api/articles/:path*', destination: '/404' },
        { source: '/api/admin', destination: '/404' },
        { source: '/api/admin/:path*', destination: '/404' },
        { source: '/api/auth', destination: '/404' },
        { source: '/api/auth/:path*', destination: '/404' },
        { source: '/api/moderation', destination: '/404' },
        { source: '/api/moderation/:path*', destination: '/404' },
        { source: '/api/site-images', destination: '/404' },
        { source: '/api/site-images/:path*', destination: '/404' },
        { source: '/api/uploads', destination: '/404' },
        { source: '/api/uploads/:path*', destination: '/404' },
        { source: '/articles', destination: '/404' },
        { source: '/articles/:path*', destination: '/404' },
        { source: '/admin', destination: '/404' },
        { source: '/admin/:path*', destination: '/404' }
      );
    }

    return rewriteContents;
  },

  // ✅ Headers — enhanced security + CSP injection
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
          {
            key: 'Content-Security-Policy',
            value: buildCspHeader({ includeVercelAnalytics: shouldIncludeVercelAnalytics() }),
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },

  trailingSlash: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 31536000,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy:
      "default-src 'self'; script-src 'none'; sandbox;",
  },

  poweredByHeader: false,
  compress: true,

  // ✅ Critical for Cloudflare Pages: enforce asset prefix & avoid root collisions
  assetPrefix: process.env.NEXT_PUBLIC_ASSET_PREFIX || '',

  // ✅ React Compiler (safe annotation mode)
  reactCompiler: {
    compilationMode: 'annotation',
  },
};

// ✅ Export chain — order matters: MDX → PWA → Analyzer
export default withBundleAnalyzer(withPwa(withMDX(nextConfig)));
