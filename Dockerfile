# syntax=docker/dockerfile:1.6

# ------------------------------
# Base image
FROM node:22-alpine AS base
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Required by Next.js (SWC) on Alpine
RUN apk add --no-cache libc6-compat

# ------------------------------
# Install dependencies with Yarn (classic)
FROM base AS deps
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Ensure devDependencies are installed for the build (TypeScript/Tailwind)
ENV NODE_ENV=development
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production=false

# ------------------------------
# Build the application
FROM base AS builder
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
RUN yarn build

# ------------------------------
# Production runtime
FROM base AS runner

# Create non-root user
RUN addgroup -g 1001 nodejs \
    && adduser -D -G nodejs -u 1001 nextjs

# Copy required runtime assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# Use Node to run Next directly; respects PORT env
CMD ["node", "node_modules/next/dist/bin/next", "start"]


