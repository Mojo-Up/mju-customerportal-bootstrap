# {{PROJECT_NAME}} Customer Portal

Multi-product customer self-service portal and subscription API. Supports multiple products, each with their own pricing plans, licences, and downloads.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  portal.{{DOMAIN}}              (React + Vite SPA)       │
│  MSAL authentication, Tailwind CSS, multi-tenant UI      │
├──────────────────────────────────────────────────────────┤
│  api.{{DOMAIN}}                 (Express + TypeScript)   │
│  Entra CIAM auth, Prisma ORM, Stripe webhooks, RBAC     │
├──────────────────────────────────────────────────────────┤
│  mcp.{{DOMAIN}}                 (MCP over Streamable HTTP)│
│  Entra Workforce OAuth, admin tools, audit logging       │
├──────────────────────────────────────────────────────────┤
│  PostgreSQL 16  │  Azure Blob Storage  │  Stripe         │
└──────────────────────────────────────────────────────────┘
```

## Getting Started

See [BOOTSTRAP.md](BOOTSTRAP.md) for full setup instructions, or run `/init` in Copilot Chat.

```bash
pnpm install
docker compose up db -d
pnpm db:migrate
pnpm dev
```

- Portal: http://localhost:5173
- API: http://localhost:3001
- MCP: http://localhost:3002

## Packages

| Package | Description |
|---|---|
| `packages/shared` | Types, Zod validation, constants |
| `packages/api` | Express API with Prisma, Entra CIAM, Stripe |
| `packages/portal` | React SPA with MSAL, Tailwind, Vite |
| `packages/mcp-server` | MCP server with Entra Workforce OAuth |

## Agents

10 Copilot agents for specialised development. See [docs/agents.md](docs/agents.md) for the full architecture.

| Agent | Purpose |
|---|---|
| `@planner` | Orchestrate features across components |
| `@initialise` | First-time project setup wizard |
| `@database` | Prisma schema and migrations |
| `@infrastructure` | Azure Bicep, Docker, environments |
| `@portal` | React SPA pages and components |
| `@mcp` | MCP server tools |
| `@api` | Express routes and middleware |
| `@github` | CI/CD and repository management |
| `@security` | OWASP security review |
| `@ui-review` | WCAG accessibility review |

## Documentation

- [BOOTSTRAP.md](BOOTSTRAP.md) — Setup guide and agent reference
- [docs/agents.md](docs/agents.md) — Agent architecture and delegation flows
- [docs/architecture.md](docs/architecture.md) — Solution architecture
- [docs/api.md](docs/api.md) — API reference
- [docs/portal.md](docs/portal.md) — Portal reference
- [docs/mcp-server.md](docs/mcp-server.md) — MCP server reference
- [docs/database.md](docs/database.md) — Database schema
- [docs/operations.md](docs/operations.md) — Operational procedures
- [docs/disaster-recovery.md](docs/disaster-recovery.md) — Backup and recovery

## Deployment

```bash
# Deploy via GitHub Actions (recommended)
gh workflow run deploy.yml -f environment=dev

# Infrastructure only
gh workflow run deploy-infra.yml -f environment=dev
```

## License

Proprietary
