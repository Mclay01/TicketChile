import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { securityHeaders } from './security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.TICKETCHILE_BUILD_DIR || '.next',
  turbopack: { root: path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..') },
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  async headers() { return [{ source: '/:path*', headers: securityHeaders(process.env.NODE_ENV === 'production') }]; },
};
export default nextConfig;
