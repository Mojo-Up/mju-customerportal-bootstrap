# Customer Portal Bootstrap

A production-ready template for building multi-tenant SaaS customer portals with Entra ID authentication, Stripe billing, Azure Communication Services email, and MCP server for AI agent management.

## Quick Start

1. **Create a new repo** from this template
2. **Run the init prompt**: Type `/init` in Copilot Chat (or `@initialise`)
3. **Follow the wizard** — it will guide you through configuration, Entra ID setup, Stripe setup, email setup, cron scheduling, and SDLC provisioning

Or configure manually:

1. Edit `bootstrap.config.json` with your project values
2. Use `@initialise` agent to apply the template

## What's Included

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  portal.{{DOMAIN}}              (React 19 + Vite 6 SPA) │
│  MSAL auth, TailwindCSS 4, multi-tenant org context     │
├──────────────────────────────────────────────────────────┤
│  api.{{DOMAIN}}                 (Express + TypeScript)   │
│  Entra CIAM auth, Prisma ORM, Stripe, RBAC, ACS email   │
├──────────────────────────────────────────────────────────┤
│  mcp.{{DOMAIN}}                 (MCP over HTTP)          │
│  Entra Workforce OAuth, 66 admin tools, audit logging    │
├──────────────────────────────────────────────────────────┤
│  PostgreSQL 16  │  Azure Blob (5 containers)  │  Stripe  │
└──────────────────────────────────────────────────────────┘
```

### Packages

| Package               | Description                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/shared`     | TypeScript types, Zod validation schemas, constants                                                                      |
| `packages/api`        | Express API — 28 Prisma models, 14 route files, 6 services, Entra CIAM auth, Stripe webhooks, ACS email, cron jobs, RBAC |
| `packages/portal`     | React SPA — 36 pages (19 main + 17 admin), MSAL auth, TailwindCSS 4, Vite 6, nginx                                       |
| `packages/mcp-server` | MCP server — 66 tools, Entra Workforce OAuth (RFC 9728/8414/7591), session management                                    |

### Key Features

- **Multi-tenant organisations** with invite system and role-based access (owner/admin/member)
- **Stripe billing** with checkout, subscriptions, and webhook-driven lifecycle sync
- **Licence management** with HMAC activation codes and environment tracking
- **Support tickets** with file attachments, SLA monitoring, and email notifications
- **Knowledge base** with markdown articles and search
- **Product catalogue** with versioned downloads and customer logos
- **Testimonials** management for marketing pages
- **Azure Communication Services** email (8 templates, graceful degradation)
- **Cron-based background jobs** (SLA checker, version notifier)
- **66 MCP admin tools** for AI-powered management via Copilot/agents

### SDLC Environments

| Environment  | Purpose                                 | Protection                         |
| ------------ | --------------------------------------- | ---------------------------------- |
| `dev`        | Local development + Azure dev resources | None                               |
| `staging`    | Pre-production verification (optional)  | Branch policy                      |
| `production` | Live customer-facing                    | Required reviewers + branch policy |

Parameter files: `infra/parameters.{dev,staging,production}.json`

### Infrastructure (Azure)

- **Container Apps** with auto-scaling (API 1–3, Portal 1–2, MCP 0–2)
- **PostgreSQL** Flexible Server (v16, 35-day backup retention)
- **Blob Storage** (ZRS, 5 containers, versioning, 30-day soft delete)
- **Container Registry** for Docker images
- **Azure Communication Services** for transactional email
- **Managed Certificates** for custom domains
- **OIDC federated identity** for CI/CD (no stored credentials)

## Configuration

Edit `bootstrap.config.json`:

```json
{
  "projectName": "Acme",
  "projectNameLower": "acme",
  "orgScope": "acme",
  "domain": "acme.com",
  "productName": "AcmePro",
  "githubOrg": "AcmeCorp",
  "repoName": "acme-portal",
  "entraCiamTenant": "acmeexternalid",
  "entraCiamTenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entraCiamClientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entraWorkforceTenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "entraWorkforceClientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "acrName": "acmeprodacr",
  "resourceGroup": "acme-portal-rg",
  "storageAccountName": "acmeprodstorage",
  "acsEndpoint": "https://acme-comms.australia.communication.azure.com",
  "acsSenderAddress": "noreply@comms.acme.com",
  "brandPrimary": "#0d9488",
  "brandAccent": "#f97316",
  "environments": ["dev", "staging", "production"],
  "branchStrategy": "trunk-based",
  "features": {
    "mcp": true,
    "stripe": true,
    "supportTickets": true,
    "downloads": true,
    "email": true,
    "knowledgeBase": true,
    "testimonials": true,
    "slaMonitoring": true
  }
}
```

The `@initialise` agent reads this file and applies all template replacements across the codebase.

## Copilot Agents

This repo includes 10 specialised Copilot agents for focused, high-quality development:

### Orchestration

| Agent          | Purpose                                                                                   | Invocation    |
| -------------- | ----------------------------------------------------------------------------------------- | ------------- |
| **Planner**    | Decomposes features into component tasks, delegates to specialists, runs validation gates | `@planner`    |
| **Initialise** | First-time project setup wizard (config, branding, Entra, Stripe, email, cron, SDLC)      | `@initialise` |

### Component Specialists

| Agent              | Scope                                                 | Invocation        |
| ------------------ | ----------------------------------------------------- | ----------------- |
| **Database**       | Prisma schema, migrations, shared types               | `@database`       |
| **Infrastructure** | Bicep, Docker, Container Apps, ACS, environments      | `@infrastructure` |
| **Portal**         | React pages, MSAL auth, Tailwind styling              | `@portal`         |
| **MCP**            | MCP tools, OAuth, sessions, audit logging             | `@mcp`            |
| **API**            | Express routes, middleware, Stripe, email, cron, RBAC | `@api`            |
| **GitHub**         | CI/CD, secrets, branch protection, PRs                | `@github`         |

### Validation Gates (Read-Only)

| Agent         | Scope                                     | Invocation   |
| ------------- | ----------------------------------------- | ------------ |
| **Security**  | OWASP Top 10, auth review, secrets audit  | `@security`  |
| **UI Review** | WCAG 2.1 AA, accessibility, design tokens | `@ui-review` |

### Delegation Flow

```
         ┌──────────────────────┐
         │   @initialise        │ (first-time setup)
         │   Setup Wizard       │
         └──────────┬───────────┘
                    │ handoff
         ┌──────────▼───────────┐
         │   @planner           │ (ongoing development)
         │   Orchestrator       │
         └──┬──┬──┬──┬──┬──┬───┘
            │  │  │  │  │  │
     ┌──────┘  │  │  │  │  └──────┐
     ▼         ▼  ▼  ▼  ▼         ▼
 @database  @api @portal @mcp  @github
 @infrastructure
                    │
            ┌───────┴───────┐
            ▼               ▼
       @security       @ui-review
      (validate)       (validate)
```

## Prompts

Quick-access entry points (type `/` in Copilot Chat):

| Prompt                  | Agent       | Purpose                      |
| ----------------------- | ----------- | ---------------------------- |
| `/init`                 | @initialise | Full project initialization  |
| `/add-feature`          | @planner    | Plan and implement a feature |
| `/add-route`            | @api        | Add an API endpoint          |
| `/add-page`             | @portal     | Add a portal page            |
| `/add-mcp-tool`         | @mcp        | Add an MCP tool              |
| `/deploy`               | @github     | Deploy to an environment     |
| `/security-review`      | @security   | Run security audit           |
| `/accessibility-review` | @ui-review  | Run WCAG audit               |

## Skills

Domain knowledge loaded on-demand by agents:

| Skill                  | Domain                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| `express-api-entra`    | Express middleware, Entra CIAM auth, Stripe webhooks, ACS email, cron jobs |
| `mcp-server-oauth`     | MCP protocol, OAuth 2.0, JWKS, RFC 9728/8414/7591, session management      |
| `pnpm-monorepo-docker` | Monorepo builds, Docker multi-stage, layer caching                         |
| `prisma-stripe-saas`   | Prisma schema, multi-tenant design, Stripe sync, licence activation        |
| `react-portal-msal`    | MSAL auth, React patterns, Vite, nginx CSP                                 |

## Development

```bash
# Install dependencies
pnpm install

# Start database
docker compose up db -d

# Run migrations
pnpm db:migrate

# Start dev servers (API on 3001, Portal on 5173)
pnpm dev

# Build all packages (shared MUST build first)
pnpm build

# Lint and typecheck
pnpm lint && pnpm typecheck
```

## GitHub Secrets (Per Environment)

| Secret                        | Description                           |
| ----------------------------- | ------------------------------------- |
| `AZURE_CLIENT_ID`             | OIDC service principal                |
| `AZURE_TENANT_ID`             | Azure AD tenant                       |
| `AZURE_SUBSCRIPTION_ID`       | Azure subscription                    |
| `ENTRA_EXTERNAL_ID_TENANT`    | CIAM tenant subdomain                 |
| `ENTRA_EXTERNAL_ID_TENANT_ID` | CIAM tenant GUID                      |
| `ENTRA_EXTERNAL_ID_CLIENT_ID` | CIAM app client ID                    |
| `ENTRA_WORKFORCE_TENANT_ID`   | Workforce tenant GUID                 |
| `ENTRA_WORKFORCE_CLIENT_ID`   | Workforce app client ID               |
| `DB_PASSWORD`                 | PostgreSQL password                   |
| `DATABASE_URL`                | Full connection string                |
| `STRIPE_SECRET_KEY`           | Stripe API key                        |
| `STRIPE_WEBHOOK_SECRET`       | Webhook signing secret                |
| `ACTIVATION_HMAC_KEY`         | Licence HMAC key                      |
| `ACS_ENDPOINT`                | Azure Communication Services endpoint |
| `ACS_SENDER_ADDRESS`          | Email sender address                  |
| `CRON_SECRET`                 | Cron endpoint auth secret             |

## GitHub Variables (Per Environment)

| Variable               | Description             | Example                |
| ---------------------- | ----------------------- | ---------------------- |
| `ACR_NAME`             | Container Registry name | `acmeprodacr`          |
| `RESOURCE_GROUP`       | Azure resource group    | `acme-portal-rg`       |
| `IMAGE_PREFIX`         | Docker image prefix     | `acme`                 |
| `API_URL`              | Public API URL          | `https://api.acme.com` |
| `POSTGRES_SERVER_NAME` | PostgreSQL server name  | `acme-prod-postgres`   |

## License

Proprietary
