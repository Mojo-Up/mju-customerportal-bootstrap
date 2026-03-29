# Agent Architecture

This document describes the Copilot agent system integrated into this customer portal bootstrap.

## Overview

The repository includes 10 custom Copilot agents organised into three tiers:

1. **Orchestration** — Planner (ongoing dev) and Initialise (first-time setup)
2. **Component Specialists** — Database, Infrastructure, Portal, MCP, API, GitHub
3. **Validation Gates** — Security and UI/Accessibility Review (read-only)

## Agent Hierarchy

```
┌─────────────────────────────────────────────────────┐
│                 Initialisation Agent                 │
│  First-time setup: config, branding, Entra, Stripe, │
│  SDLC environments, build verification              │
│  Delegates to: infrastructure, database, github,    │
│                portal                               │
└──────────────────────┬──────────────────────────────┘
                       │ handoff after init complete
┌──────────────────────▼──────────────────────────────┐
│                    Planner Agent                     │
│  Ongoing orchestrator: decomposes feature requests,  │
│  delegates to specialists, runs validation gates     │
│  Delegates to: ALL component + validation agents     │
└──┬───┬───┬───┬───┬───┬───────┬──────────┬──────────┘
   │   │   │   │   │   │       │          │
   ▼   ▼   ▼   ▼   ▼   ▼       ▼          ▼
  DB  Infra Portal MCP API  GitHub   Security  UI/A11y
  rw   rw    rw    rw   rw    rw      read     read
```

## Agent Details

### Planner (`@planner`)

The orchestrator agent. It:
- Receives feature or change requests from the user
- Decomposes work into component-level tasks using the todo list
- Delegates tasks to the appropriate specialist agent
- Coordinates cross-cutting changes (e.g. shared type changes that ripple to API + Portal)
- Invokes `@security` and `@ui-review` as quality gates after implementation
- Reports consolidated results

**Tools**: agent (delegation), search, read, web, todo
**Sub-agents**: database, infrastructure, portal, mcp, api, github, security, ui-review

### Initialise (`@initialise`)

The first-time setup wizard. It:
1. Reads `bootstrap.config.json` and collects missing values
2. Applies `{{PLACEHOLDER}}` replacements across the entire codebase
3. Sets up branding (colours, logo guidance)
4. Guides Entra ID app registration (CIAM for customers, Workforce for staff)
5. Guides Stripe configuration (products, webhooks)
6. Provisions SDLC environments (dev → staging → production)
7. Delegates to `@github` for CI/CD setup
8. Delegates to `@database` for initial migration
9. Runs build verification
10. Generates setup report

**Tools**: agent, search, read, edit, execute, web, todo
**Sub-agents**: infrastructure, database, github, portal

### Database (`@database`)

Manages the Prisma schema, migrations, and shared type synchronisation.

**Scope**: `packages/api/prisma/`, `packages/shared/src/types/`, `packages/shared/src/validation/`
**Skill**: `prisma-stripe-saas`
**Tools**: search, read, edit, execute

### Infrastructure (`@infrastructure`)

Manages Azure Bicep, Docker, Container Apps, and environment configuration.

**Scope**: `infra/`, `docker-compose.yml`, `packages/*/Dockerfile`
**Skill**: `pnpm-monorepo-docker`
**Tools**: search, read, edit, execute

### Portal (`@portal`)

Develops React SPA pages, components, auth flows, and Tailwind styling.

**Scope**: `packages/portal/`
**Skill**: `react-portal-msal`
**Tools**: search, read, edit, execute

### MCP (`@mcp`)

Develops MCP server tools, OAuth flow, and session management.

**Scope**: `packages/mcp-server/`
**Skill**: `mcp-server-oauth`
**Tools**: search, read, edit, execute

### API (`@api`)

Develops Express routes, middleware, Stripe integration, and RBAC.

**Scope**: `packages/api/src/`
**Skill**: `express-api-entra`
**Tools**: search, read, edit, execute

### GitHub (`@github`)

Manages CI/CD pipelines, secrets, branch protection, and deployment workflows.

**Scope**: `.github/workflows/`, repository settings
**Tools**: search, read, edit, execute, web

### Security (`@security`)

Read-only security reviewer. Reviews OWASP Top 10, auth, input validation, secrets, headers, rate limiting, Docker, and infrastructure security. Reports findings with severity ratings (CRITICAL/HIGH/MEDIUM/LOW).

**Tools**: search, read (read-only — does not modify code)

### UI Review (`@ui-review`)

Read-only accessibility reviewer. Reviews WCAG 2.1 AA compliance including semantic HTML, keyboard navigation, ARIA, colour contrast, responsive design, forms, and design token consistency. Reports findings with WCAG criterion numbers.

**Tools**: search, read (read-only — does not modify code)

## Delegation Patterns

### New Feature

```
User → @planner → decompose into tasks
  → @database (if schema changes needed)
  → @api (routes + services)
  → @portal (UI pages)
  → @security (review)
  → @ui-review (review)
  → Report to user
```

### Schema Change

```
User → @database
  → Edit schema.prisma
  → Generate migration
  → Update shared types
  → Run typecheck (catches API/Portal breaks)
```

### Cross-Cutting Auth Change

```
User → @planner
  → @api (middleware changes)
  → @portal (MSAL config changes)
  → @mcp (OAuth config changes)
  → @security (review auth changes)
  → Report to user
```

### Deployment

```
User → @github
  → Pre-deployment checks
  → Trigger deploy workflow
  → Post-deployment verification
```

## File Locations

All agent files: `.github/agents/*.agent.md`
All prompts: `.github/prompts/*.prompt.md`
All instructions: `.github/instructions/*.instructions.md`
All skills: `.github/skills/*/SKILL.md`
Workspace instructions: `.github/copilot-instructions.md`
