---
name: pnpm-monorepo-docker
description: 'Build pnpm workspace monorepos with shared packages, Docker multi-stage builds, Bicep infrastructure, and CI/CD deployment. Use when: setting up pnpm monorepo, creating Docker builds for monorepo packages, writing Bicep for Azure Container Apps, building shared TypeScript packages, configuring monorepo CI/CD pipeline.'
---

# pnpm Monorepo with Docker & Azure Infrastructure

Set up and maintain pnpm workspace monorepos with shared TypeScript packages, multi-stage Docker builds for each service, and Azure infrastructure via Bicep.

## When to Use

- Creating a new pnpm monorepo with shared packages
- Adding Docker builds to monorepo packages
- Writing Bicep for Azure Container Apps deployment
- Configuring shared TypeScript compilation
- Debugging monorepo dependency resolution

## Monorepo Structure

```
├── package.json              # Root: devDependencies only (eslint, prettier)
├── pnpm-workspace.yaml       # Workspace definition
├── pnpm-lock.yaml            # Single lockfile for all packages
├── tsconfig.base.json        # Shared TypeScript config
├── docker-compose.yml        # Local development
├── infra/
│   ├── main.bicep            # Azure infrastructure
│   └── parameters.dev.json
└── packages/
    ├── shared/               # Types, validation, constants
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    ├── api/                  # Express API
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── Dockerfile
    │   └── prisma/
    ├── portal/               # React SPA
    │   ├── package.json
    │   ├── tsconfig.json
    │   ├── Dockerfile
    │   └── nginx.conf
    └── mcp-server/           # MCP server
        ├── package.json
        ├── tsconfig.json
        └── Dockerfile
```

## pnpm Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
```

```json
// Root package.json
{
  "private": true,
  "scripts": {
    "dev": "pnpm --parallel --filter './packages/**' dev",
    "build": "pnpm --filter @{{ORG_SCOPE}}/shared build && pnpm --parallel --filter '!@{{ORG_SCOPE}}/shared' build",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint ."
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "typescript": "^5.8.0"
  }
}
```

**Gotcha**: Build order matters. The shared package MUST build first (others depend on it). Use `&&` not `--parallel` for the shared build step.

## Shared Package Pattern

```json
// packages/shared/package.json
{
  "name": "@{{ORG_SCOPE}}/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "typecheck": "tsc --noEmit"
  }
}
```

**Consuming packages reference with `workspace:*`**:

```json
// packages/api/package.json
{
  "dependencies": {
    "@{{ORG_SCOPE}}/shared": "workspace:*"
  }
}
```

## TypeScript Configuration

```json
// tsconfig.base.json (root)
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

```json
// packages/api/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "references": [{ "path": "../shared" }]
}
```

**Gotcha**: Use `"module": "Node16"` (not `"ESNext"`) for Node.js packages. This correctly resolves `.js` extensions in import paths, which is required for ESM.

## Docker Multi-Stage Builds

### Pattern: Copy All package.json Stubs First

This leverages Docker layer caching — `pnpm install` only reruns when dependencies change:

```dockerfile
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

# Layer 1: Install dependencies (cached unless package.json/lockfile changes)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/portal/package.json packages/portal/
COPY packages/mcp-server/package.json packages/mcp-server/
RUN pnpm install --frozen-lockfile --shamefully-hoist

# Layer 2: Copy source and build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/api packages/api
RUN pnpm --filter @{{ORG_SCOPE}}/shared build
RUN cd packages/api && npx prisma generate
RUN pnpm --filter @{{ORG_SCOPE}}/api build
```

**Why `--shamefully-hoist`?** Some packages (especially Prisma, native modules) don't work with pnpm's strict symlink structure. This hoists to a flat `node_modules` like npm.

**Why copy ALL package.json files?** pnpm's lockfile references all workspace packages. If any stub is missing, `--frozen-lockfile` fails.

### Production Stage: Minimal Image

```dockerfile
FROM node:24-slim
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10 --activate

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser
WORKDIR /app

# Copy only runtime artifacts
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/packages/shared/dist ./packages/shared/dist
COPY --from=base /app/packages/shared/package.json ./packages/shared/
COPY --from=base /app/packages/api/dist ./packages/api/dist
COPY --from=base /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=base /app/packages/api/package.json ./packages/api/
COPY --from=base /app/packages/api/prisma ./packages/api/prisma
COPY --from=base /app/package.json ./
COPY --from=base /app/pnpm-workspace.yaml ./

USER appuser
EXPOSE 3001
WORKDIR /app/packages/api
CMD ["node", "dist/index.js"]
```

**Gotchas**:

- Must copy `pnpm-workspace.yaml` and root `package.json` — pnpm resolves workspace links at runtime
- Must copy `prisma/` directory — Prisma client needs the schema at runtime
- `openssl` is required by Prisma in slim images
- Run as non-root user in production

### Portal: Nginx Runtime

```dockerfile
# Build in Node
FROM node:24-slim AS build
# ... install, copy, build ...

ARG VITE_API_URL
ARG VITE_ENTRA_EXTERNAL_ID_TENANT
ARG VITE_ENTRA_EXTERNAL_ID_CLIENT_ID
RUN pnpm --filter @{{ORG_SCOPE}}/portal build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/packages/portal/dist /usr/share/nginx/html
COPY packages/portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**Gotcha**: Vite env vars (`VITE_*`) are embedded at build time. You must pass them as `ARG`s in the Docker build, not as runtime `ENV`.

## Docker Compose (Local Development)

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: {{PROJECT_NAME_LOWER}}_portal
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - '5432:5432'
    volumes:
      - pgdata:/var/lib/postgresql/data

  api:
    build:
      context: .
      dockerfile: packages/api/Dockerfile
    ports:
      - '3001:3001'
    environment:
      DATABASE_URL: postgresql://postgres:postgres@db:5432/{{PROJECT_NAME_LOWER}}_portal
      # ... other env vars
    depends_on:
      - db

  portal:
    build:
      context: .
      dockerfile: packages/portal/Dockerfile
      args:
        VITE_API_URL: http://localhost:3001
    ports:
      - '5173:80'

volumes:
  pgdata:
```

**Important**: Docker build context is ALWAYS the monorepo root (`.`), not the package directory. Dockerfiles reference paths relative to root.

## Azure Infrastructure (Bicep)

### Container Apps Pattern

```bicep
param location string = resourceGroup().location
param envName string

// Container App Environment
resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${envName}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
    }
  }
}

// API Container App
resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${envName}-api'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
      }
      secrets: [
        { name: 'database-url', value: databaseUrl }
        { name: 'stripe-key', value: stripeKey }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: '${acrName}.azurecr.io/${envName}-api:latest'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'NODE_ENV', value: 'production' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}
```

### Key Infrastructure Components

- **Azure Container Registry**: Stores Docker images
- **Azure Container Apps**: Runs API, portal, MCP server
- **Azure Database for PostgreSQL**: Managed Postgres (flexible server)
- **Azure Blob Storage**: File downloads
- **Custom domains**: Map to Container App ingress

## CI/CD Patterns

### Build Order

```yaml
# GitHub Actions workflow
steps:
  - name: Build shared
    run: pnpm --filter @{{ORG_SCOPE}}/shared build

  - name: Build API (depends on shared + prisma)
    run: |
      cd packages/api && npx prisma generate
      pnpm --filter @{{ORG_SCOPE}}/api build

  - name: Build Portal (depends on shared)
    run: pnpm --filter @{{ORG_SCOPE}}/portal build

  - name: Build MCP (depends on shared + prisma)
    run: |
      cd packages/api && npx prisma generate
      pnpm --filter @{{ORG_SCOPE}}/mcp-server build
```

### Docker Build & Push

```yaml
- name: Build and push API
  run: |
    docker build -f packages/api/Dockerfile -t $ACR/api:$SHA .
    docker push $ACR/api:$SHA

- name: Build and push Portal
  run: |
    docker build -f packages/portal/Dockerfile \
      --build-arg VITE_API_URL=$API_URL \
      --build-arg VITE_ENTRA_EXTERNAL_ID_TENANT=$TENANT \
      --build-arg VITE_ENTRA_EXTERNAL_ID_CLIENT_ID=$CLIENT_ID \
      -t $ACR/portal:$SHA .
    docker push $ACR/portal:$SHA
```

## Common Issues

### "Cannot find module '@{{ORG_SCOPE}}/shared'"

The shared package isn't built. Run `pnpm --filter @{{ORG_SCOPE}}/shared build` first.

### "prisma generate" fails in Docker

Missing `openssl` in the base image. Add: `RUN apt-get update && apt-get install -y openssl`

### pnpm install fails with --frozen-lockfile

A `package.json` was modified without running `pnpm install` to update the lockfile. Run `pnpm install` locally and commit the updated `pnpm-lock.yaml`.

### Module import errors with .js extensions

TypeScript ESM requires `.js` extensions in imports even though the source files are `.ts`. Use `"module": "Node16"` in tsconfig.

### Docker context errors ("file not found")

Docker context must be the monorepo root. Use `-f packages/api/Dockerfile` to specify the Dockerfile, but `.` as the context.
