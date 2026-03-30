# {{PROJECT_NAME}} Customer Portal

Multi-product customer self-service portal, subscription API, and AI agent automation server for {{PROJECT_NAME}}. Supports multiple products (e.g. {{PRODUCT_NAME}}), each with their own pricing plans, licences, downloads, knowledge base articles, and support.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  portal.{{DOMAIN}}             (React 19 + Vite 6 SPA)   │
│  ├── Customer: Dashboard, Products, Licences, Support,      │
│  │   Downloads, KB, Contact, Billing, Profile               │
│  ├── Admin: Products, Orgs, Users, Tickets, Downloads, KB,  │
│  │   Versions, Logos, Testimonials, SLA, Teams (staff only) │
│  └── Auth: Microsoft Entra External ID (CIAM) via MSAL      │
├─────────────────────────────────────────────────────────────┤
│  api.{{DOMAIN}}                (Express + TypeScript)    │
│  ├── Portal API — orgs, licences, tickets, downloads, KB    │
│  ├── Public API — products, versions, check-in, contact, KB │
│  ├── Stripe webhooks — subscription lifecycle               │
│  ├── Admin API — full management (66 capabilities)          │
│  └── Services — email (ACS), SLA, activation, blob storage  │
├─────────────────────────────────────────────────────────────┤
│  customerportalmcp.{{DOMAIN}}  (MCP over Streamable HTTP)│
│  └── 66 AI agent tools for staff automation                 │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL 16  │  Azure Blob Storage  │  Stripe  │  Entra  │
│  Azure Comms    │  Log Analytics       │  ACR     │         │
└─────────────────────────────────────────────────────────────┘
```

## Monorepo Structure

| Package               | Description                                     | Runtime         |
| --------------------- | ----------------------------------------------- | --------------- |
| `packages/shared`     | Shared types, Zod validation schemas, constants | Build-time only |
| `packages/api`        | Express API server with Prisma ORM              | Node.js 24      |
| `packages/portal`     | React 19 + Vite 6 SPA (TailwindCSS 4)           | nginx (static)  |
| `packages/mcp-server` | MCP server (Streamable HTTP) for AI agents      | Node.js 24      |

## Prerequisites

- **Node.js** ≥ 24
- **pnpm** ≥ 10
- **PostgreSQL** 16 (or Docker)
- **Microsoft Entra External ID** tenant (CIAM)
- **Stripe** account with test keys

## Quick Start

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Start PostgreSQL (via Docker)
docker compose up db -d

# Push schema to database
pnpm db:push

# Start all services in dev mode
pnpm dev
```

## Environment Variables

Copy `.env.example` files and fill in real values:

```bash
cp packages/api/.env.example packages/api/.env
cp packages/portal/.env.example packages/portal/.env
```

### API (`packages/api/.env`)

| Variable                          | Description                           |
| --------------------------------- | ------------------------------------- |
| `DATABASE_URL`                    | PostgreSQL connection string          |
| `ENTRA_EXTERNAL_ID_TENANT`        | Entra External ID tenant subdomain    |
| `ENTRA_EXTERNAL_ID_TENANT_ID`     | Entra External ID tenant ID (GUID)    |
| `ENTRA_EXTERNAL_ID_CLIENT_ID`     | Entra External ID app client ID       |
| `STRIPE_SECRET_KEY`               | Stripe secret key (`sk_test_...`)     |
| `STRIPE_WEBHOOK_SECRET`           | Stripe webhook signing secret         |
| `ACTIVATION_HMAC_KEY`             | HMAC key for licence activation codes |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob Storage connection string  |
| `ACS_CONNECTION_STRING`           | Azure Communication Services (email)  |
| `ACS_SENDER_ADDRESS`              | Email sender address                  |
| `PORTAL_URL`                      | Portal URL (CORS, redirects)          |
| `API_URL`                         | Public API URL                        |
| `CRON_SECRET`                     | Secret for cron job endpoints         |

> **Note:** Stripe Price IDs are no longer in env vars — they're stored per-product in the `ProductPricingPlan` table.

### Portal (`packages/portal/.env`)

| Variable                           | Description                        |
| ---------------------------------- | ---------------------------------- |
| `VITE_API_URL`                     | API base URL                       |
| `VITE_ENTRA_EXTERNAL_ID_TENANT`    | Entra External ID tenant subdomain |
| `VITE_ENTRA_EXTERNAL_ID_CLIENT_ID` | Entra External ID client ID        |

## Scripts

| Command            | Description                      |
| ------------------ | -------------------------------- |
| `pnpm dev`         | Start all packages in dev mode   |
| `pnpm dev:api`     | Start API only (port 3001)       |
| `pnpm dev:portal`  | Start Portal only (port 5173)    |
| `pnpm build`       | Build all packages               |
| `pnpm lint`        | Lint all packages                |
| `pnpm typecheck`   | Type-check all packages          |
| `pnpm db:generate` | Generate Prisma client           |
| `pnpm db:migrate`  | Run database migrations          |
| `pnpm db:push`     | Push schema directly to database |
| `pnpm db:studio`   | Open Prisma Studio               |

## Key Features

- **Multi-product catalogue** — each product has its own pricing plans, subscriptions, and licences
- **Organisation-based multi-tenancy** — users belong to organisations with roles (owner, admin, billing, technical)
- **HMAC-SHA256 licence activation** — signed activation codes compatible with product apps (e.g., {{PRODUCT_NAME}})
- **Stripe Checkout redirect** — pricing plans stored in DB; no billing data stored in the portal
- **Subscription check-in API** — public endpoint polled by product apps daily, with version update checks
- **Support ticket system** — with SLA policies, team routing, file attachments, internal notes, and email notifications
- **Knowledge base** — articles with versioning, search, and content feedback
- **File downloads** — Azure Blob Storage with SAS URL generation, scoped per product
- **Product versions** — release management with automatic new-version email notifications
- **Customer logos & testimonials** — curated social proof for landing and product pages
- **Contact form** — public submissions with email forwarding
- **Email notifications** — Azure Communication Services for invitations, ticket replies, SLA alerts, and version updates
- **Admin panel** — staff can manage products, pricing, organisations, users, tickets, downloads, KB, versions, logos, testimonials, SLA, and support teams
- **MCP server** — 66 AI agent tools at `customerportalmcp.{{DOMAIN}}` for comprehensive staff automation

## Copilot Agents

This repo includes specialised Copilot agents for focused development:

| Agent             | Purpose                                                    |
| ----------------- | ---------------------------------------------------------- |
| `@planner`        | Orchestrate multi-component features with validation gates |
| `@database`       | Prisma schema, migrations, shared types                    |
| `@infrastructure` | Bicep, Docker, Container Apps, environments                |
| `@portal`         | React pages, components, MSAL auth, Tailwind styling       |
| `@mcp`            | MCP server tools, OAuth, sessions                          |
| `@api`            | Express routes, middleware, Stripe webhooks, RBAC          |
| `@github`         | CI/CD, secrets, branch protection, PR workflows            |
| `@security`       | OWASP security review (read-only audit)                    |
| `@ui-review`      | WCAG accessibility review (read-only audit)                |

**Prompts**: `/add-feature`, `/add-route`, `/add-page`, `/add-mcp-tool`, `/add-migration`, `/deploy`, `/security-review`, `/accessibility-review`

## Deployment

Infrastructure is defined in Bicep (`infra/main.bicep`) targeting Azure Container Apps:

```bash
# Deploy to Azure (via GitHub Actions)
gh workflow run deploy.yml --field environment=prod
```

CI/CD workflows are in `.github/workflows/`:

- **ci.yml** — lint, typecheck, build on PRs
- **deploy.yml** — build Docker images, push to ACR, deploy to Container Apps

## Documentation

Detailed documentation is in the [`docs/`](docs/) folder:

| Document                                                | Description                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Architecture](docs/architecture.md)                    | System overview, data model, authentication, infrastructure, CI/CD          |
| [API](docs/api.md)                                      | REST endpoints, middleware, authentication, webhooks, admin routes          |
| [Portal](docs/portal.md)                                | React SPA, routing, MSAL auth, org context, pages, build & deployment       |
| [MCP Server](docs/mcp-server.md)                        | AI agent tools, OAuth metadata, session management, tool reference          |
| [Database](docs/database.md)                            | Schema, entity relationships, indexes, migrations, multi-tenancy model      |
| [Operations](docs/operations.md)                        | Deployment, local development, database ops, monitoring, scaling, rollbacks |
| [Disaster Recovery & Backup](docs/disaster-recovery.md) | Backup configuration, restore procedures, DR scenarios, verification        |

## Licence

Proprietary — {{PROJECT_NAME}} Pty Ltd
