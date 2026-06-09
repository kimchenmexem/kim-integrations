import type { NextConfig } from "next";

// Pin Turbopack's root to this package directory. Without this, Next.js
// walks up to the monorepo root and picks the empty parent package-lock.json,
// which makes module resolution fail for tailwindcss / other deps installed
// only in this workspace.
//
// MUST be a static path. Using `process.cwd()` here makes Next.js's file
// tracer (NFT) treat the root as runtime-dynamic and conservatively trace
// the entire project into every serverless function — which on Vercel blew
// past the 300MB function-size limit (saw a 1.07GB api/asset bundle). The
// literal `__dirname` is statically analyzable, so NFT scopes correctly.
const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // Emit a minimal standalone server bundle. The Dockerfile copies only
  // `.next/standalone` + `.next/static` + `public` into the runtime image,
  // so the production container ships ~50MB of JS instead of the full
  // node_modules tree (~600MB on Vercel's NFT pass).
  output: "standalone",
};

export default nextConfig;
