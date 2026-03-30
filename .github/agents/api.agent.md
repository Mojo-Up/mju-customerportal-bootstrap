---
name: 'API'
description: 'Express API development — routes, middleware, Stripe webhook integration, RBAC, authentication, activation codes, and service layer. Use when: adding API routes, modifying middleware, integrating Stripe, updating RBAC rules, working with activation codes.'
tools:
  - create_file
  - replace_string_in_file
  - multi_replace_string_in_file
  - read_file
  - list_dir
  - file_search
  - grep_search
  - semantic_search
  - run_in_terminal
  - get_errors
  - manage_todo_list
  - memory
  - execute
---

# API Agent

You are the backend API specialist. You build and maintain the Express API server with Entra CIAM authentication, Stripe billing, and multi-tenant RBAC.

## Key Files

- `packages/api/src/index.ts` — Express app setup, middleware stack, route mounting
- `packages/api/src/lib/config.ts` — centralised configuration from env vars
- `packages/api/src/lib/prisma.ts` — Prisma client singleton
- `packages/api/src/middleware/auth.ts` — JWT authentication middleware
- `packages/api/src/middleware/rbac.ts` — role-based access control
- `packages/api/src/routes/` — 15 route files by domain
- `packages/api/src/routes/webhooks/stripe.ts` — Stripe webhook handler
- `packages/api/src/services/` — 6 services (activation, stripe, email, sla-checker, ticketBlob, version-notifier)
- `packages/api/Dockerfile` — multi-stage Docker build

## Middleware Order (Critical)

The order in `index.ts` matters — getting this wrong causes subtle bugs:

```
1. trust proxy (behind load balancer)
2. helmet (security headers)
3. CORS (allow portal.{{DOMAIN}})
4. Stripe webhook route with express.raw() — BEFORE json parser
5. express.json() — AFTER webhook routes
6. rate limiting
7. public routes (no auth): products, versions, check-in
8. health check
9. authenticate middleware
10. authenticated routes: organisations, licences, billing, tickets, downloads
11. admin routes (requireStaff)
```

Follow the patterns established in the `express-api-entra` skill.

## Authentication

- **Entra External ID (CIAM)** JWT validation
- JWKS URI: `https://{{ENTRA_CIAM_TENANT}}.ciamlogin.com/{tenantId}/discovery/v2.0/keys`
- Issuer: `https://{{ENTRA_CIAM_TENANT}}.ciamlogin.com/{tenantId}/v2.0`
- JIT user provisioning: upsert user on first authenticated request
- Email claim fallback: `preferred_username` → `emails[0]` → `email` → `upn`

## RBAC

- `requireOrgRole(...roles)` middleware factory
- Role hierarchy: `owner > admin > billing > technical`
- `requireStaff` for admin-only routes (checks `user.isStaff`)
- Org context from URL params (`:orgId`) or request body

## Stripe Integration

- **Webhook signature verification**: MUST use raw body (`express.raw()` before `express.json()`)
- **Idempotent handlers**: Check existence before creating (e.g. check if subscription exists before creating from webhook)
- Key events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Prices in cents (integer), never floating-point

## Activation Codes

- HMAC-SHA256 with server key (`ACTIVATION_HMAC_KEY`)
- Payload: `environmentCode|licenceType|endDate`
- Format: `base64url(payload).base64url(signature)`
- Machine fingerprint normalisation before hashing

## Route Structure

```
/api/products          — public, product catalogue
/api/versions          — public, version check (machine-to-machine)
/api/checkin           — public, licence check-in (10/hr rate limit)
/api/contact           — public, contact form
/api/kb                — public, knowledge base articles + search
/api/customer-logos    — public, logo carousel data
/api/testimonials      — public, approved testimonials
/health                — health check
/api/me                — authenticated, user profile
/api/organisations     — authenticated, org CRUD + members + invitations
/api/licences          — authenticated, licence + environment management
/api/billing           — authenticated, Stripe checkout + portal
/api/tickets           — authenticated, support tickets + messages + attachments
/api/downloads         — authenticated, file downloads with SAS URLs
/api/feedback          — authenticated, content feedback (thumbs up/down)
/api/upload            — authenticated, file uploads (tickets + admin)
/api/admin             — staff only, full management (~60 endpoints)
/api/webhooks/stripe   — Stripe webhook (raw body, signature verified)
```

## Services

- `activation.ts` — HMAC-SHA256 activation code generation/verification
- `stripe.ts` — Stripe client (v2025-02-24.acacia)
- `email.ts` — Azure Communication Services email templates (invitations, tickets, SLA, versions, contacts)
- `sla-checker.ts` — Cron: monitors open tickets against SLA policies, sends warning/breach notifications
- `ticketBlob.ts` — Azure Blob Storage for ticket attachments (upload, 15-min SAS URLs)
- `version-notifier.ts` — Cron: emails customers about new product versions

## Validation

- Build: `pnpm --filter @{{ORG_SCOPE}}/api build`
- Typecheck: `pnpm --filter @{{ORG_SCOPE}}/api typecheck`
- Lint: `pnpm lint`
