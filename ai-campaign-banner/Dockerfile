# syntax=docker/dockerfile:1.7
# Render deploy image for ai-campaign-banner.
#
# Why Microsoft's Playwright base image:
#   The campaign-render pipeline launches headless Chromium via Playwright
#   (src/lib/render/renderCampaign.ts). Installing Chromium + its OS libs on
#   stock Node images is a moving target — this image is the official one,
#   pinned to a Playwright version that already has the right Chromium bundled.
#
# Pin the tag to match `playwright` in package.json (1.59.x).
FROM mcr.microsoft.com/playwright:v1.59.1-jammy AS base
WORKDIR /app

# Build stage — install ALL deps (incl. dev) so `next build` and the prebuild
# tsx script have everything they need.
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime stage — ship the standalone server bundle only.
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=10000
ENV HOSTNAME=0.0.0.0

# Copy as root (WORKDIR creates /app as root). The --chown on COPY sets the
# OWNERSHIP of the copied CONTENTS to pwuser, but /app itself stays root-
# owned unless we explicitly chown it. Without that, the entrypoint can't
# rm/symlink children of /app (writing to /app requires owning it).
COPY --from=builder --chown=pwuser:pwuser /app/.next/standalone ./
COPY --from=builder --chown=pwuser:pwuser /app/.next/static ./.next/static
COPY --from=builder --chown=pwuser:pwuser /app/public ./public

# Persistent disk mount point. Render attaches the disk at /app/storage; the
# entrypoint creates symlinks so the app keeps writing to its usual paths
# (data/, public/rendered-ads/, public/nano-banana/) but those writes land
# on the persistent volume.
COPY --chown=pwuser:pwuser scripts/render-entrypoint.sh /app/render-entrypoint.sh

# Make pwuser own /app so the entrypoint can manage child paths.
RUN chown pwuser:pwuser /app

USER pwuser

EXPOSE 10000
ENTRYPOINT ["/app/render-entrypoint.sh"]
CMD ["node", "server.js"]
