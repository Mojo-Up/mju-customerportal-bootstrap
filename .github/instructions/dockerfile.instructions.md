---
description: "Dockerfile conventions — multi-stage builds, pnpm workspace layer caching, Prisma native modules, non-root production users. Use when: editing Dockerfiles."
applyTo: "**/Dockerfile"
---

# Dockerfile Conventions

## Multi-Stage Build Pattern
1. **Base stage**: Install dependencies (layer cached)
2. **Build stage**: Copy source, compile TypeScript
3. **Production stage**: Minimal image with built artifacts only

## Layer Caching (Critical)
- Copy ALL `package.json` stubs FIRST (before any source code)
- Include all workspace packages even if not directly needed (lockfile resolution)
- Copy `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json` first

## pnpm Workspace
- Use `--frozen-lockfile` (CI reproducibility)
- Use `--shamefully-hoist` for Prisma and native modules
- `--ignore-scripts` safe for Portal (no native modules)

## Build Order
- shared FIRST: `pnpm --filter @{{ORG_SCOPE}}/shared build`
- Then target package: `pnpm --filter @{{ORG_SCOPE}}/api build`
- Prisma: `cd packages/api && npx prisma generate` before API/MCP build

## Production Stage
- Use `node:24-slim` (not full node image)
- Install `openssl` for Prisma in slim images
- Copy `pnpm-workspace.yaml` + root `package.json` (pnpm expects them)
- Copy `prisma/` schema directory (Prisma client needs it at runtime)
- Use non-root user: `USER node` or create dedicated user
- Portal: Vite builds to static files → serve via `nginx:alpine`
