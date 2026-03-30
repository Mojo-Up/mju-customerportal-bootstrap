# Workspace Instructions

This is the **{{PROJECT_NAME}} Customer Portal** — a pnpm monorepo with 4 packages that build a multi-tenant SaaS portal with Entra ID authentication, Stripe billing, and MCP server for AI agent management.

## Monorepo Structure

```
packages/
  shared/    → TypeScript types, Zod validation, constants (builds FIRST)
  api/       → Express API with Prisma, Entra CIAM auth, Stripe
  portal/    → React SPA with MSAL, Tailwind, Vite
  mcp-server/→ MCP server with Entra Workforce OAuth
```

## Build Order (Critical)

**shared MUST build first** — use `&&` not `--parallel`:

```bash
pnpm --filter @{{ORG_SCOPE}}/shared build && pnpm --filter @{{ORG_SCOPE}}/api build
```

After schema changes: `pnpm db:generate` before building API or MCP.

## Key Commands

| Command            | Purpose                                   |
| ------------------ | ----------------------------------------- |
| `pnpm dev`         | Start all packages in dev mode (parallel) |
| `pnpm dev:api`     | Start API only (port 3001)                |
| `pnpm dev:portal`  | Start Portal only (port 5173)             |
| `pnpm build`       | Build all packages (respects order)       |
| `pnpm lint`        | Lint all packages                         |
| `pnpm typecheck`   | Typecheck all packages                    |
| `pnpm db:generate` | Generate Prisma client                    |
| `pnpm db:migrate`  | Run database migrations                   |
| `pnpm db:studio`   | Open Prisma Studio GUI                    |

## Agent Delegation

This repo includes specialised Copilot agents. Use them for focused work:

- `@planner` — Orchestrate multi-component features with validation gates
- `@database` — Prisma schema, migrations, shared types
- `@infrastructure` — Bicep, Docker, Container Apps, environments
- `@portal` — React pages, components, MSAL auth, Tailwind styling
- `@mcp` — MCP server tools, OAuth, sessions
- `@api` — Express routes, middleware, Stripe webhooks, RBAC
- `@github` — CI/CD, secrets, branch protection, PR workflows
- `@security` — OWASP security review (read-only audit)
- `@ui-review` — WCAG accessibility review (read-only audit)

## Code Conventions

- TypeScript strict mode everywhere
- `module: "Node16"` for Node.js packages, `.js` extensions in imports
- `module: "ESNext"` with `moduleResolution: "bundler"` for Portal (Vite)
- Environment variables centralised in `packages/api/src/lib/config.ts`
- Zod validation at API boundaries (`packages/shared/src/validation/schemas.ts`)
- Prisma for all database access (no raw SQL unless necessary)
- Prices in cents (integer), never floating-point
