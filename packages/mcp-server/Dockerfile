FROM node:24-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Install dependencies (need all workspace package.json stubs for lockfile)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/portal/package.json packages/portal/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/mcp-server packages/mcp-server
COPY packages/api/prisma packages/api/prisma
RUN pnpm --filter @{{ORG_SCOPE}}/shared build
RUN cd packages/api && npx prisma generate
RUN pnpm --filter @{{ORG_SCOPE}}/mcp-server build

# Production image
FROM node:24-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
RUN groupadd -r mcpuser && useradd -r -g mcpuser -d /app mcpuser
WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/mcp-server/dist ./packages/mcp-server/dist
COPY --from=base /app/packages/mcp-server/node_modules ./packages/mcp-server/node_modules
COPY --from=base /app/packages/mcp-server/package.json ./packages/mcp-server/
COPY --from=base /app/packages/api/prisma ./packages/api/prisma
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-workspace.yaml ./

USER mcpuser
EXPOSE 3002
ENV MCP_PORT=3002
WORKDIR /app/packages/mcp-server
CMD ["node", "dist/index.js"]
