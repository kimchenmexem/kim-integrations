import type { NextConfig } from "next";

// Pin Turbopack's root to this package directory. Without this, Next.js
// walks up to the monorepo root and picks the empty parent package-lock.json,
// which makes module resolution fail for tailwindcss / other deps installed
// only in this workspace. process.cwd() is the directory `next dev` is
// launched from — which IS this package because `npm run dev` resolves
// scripts from the package.json that owns it.
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
