---
name: express-api-entra
description: 'Build Express APIs with Entra External ID (CIAM) authentication, RBAC middleware, Stripe webhooks, Zod validation, multi-tenant org context, file uploads (multer), Azure Communication Services email, and background services. Use when: creating Express API with Entra auth, adding RBAC to routes, integrating Stripe webhooks, building multi-tenant APIs, adding file upload endpoints, sending email via ACS, debugging JWT validation with CIAM tenants.'
---

# Express API with Entra External ID & Stripe

Build production Express APIs with Entra External ID (CIAM) authentication, role-based access control, Stripe billing integration, and multi-tenant organization context.

## When to Use

- Creating a new Express API with Entra authentication
- Adding RBAC middleware to route groups
- Integrating Stripe webhooks with signature verification
- Building multi-tenant SaaS APIs with org context
- Debugging CIAM token validation issues

## Middleware Order (Critical)

The order of Express middleware matters. Getting this wrong causes subtle bugs:

```typescript
// 1. Trust proxy (MUST be first if behind load balancer)
app.set('trust proxy', 1);

// 2. Security headers
app.use(helmet());

// 3. CORS
app.use(cors({ origin: config.portalUrl, credentials: true }));

// 4. Stripe webhook route — BEFORE json parser (raw body needed)
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeRoutes);

// 5. JSON parser (AFTER webhook routes)
app.use(express.json({ limit: '1mb' }));

// 6. Rate limiting
app.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 1000 }));

// 7. Public routes (no auth)
app.use('/api/products', productRoutes);
app.use('/api/versions', versionRoutes);

// 8. Health check (no auth, no rate limit)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// 9. Authenticated routes
app.use(authenticate);
app.use('/api/organisations', orgRoutes);

// 10. Admin routes (auth + staff check)
app.use('/api/admin', requireStaff, adminRoutes);

// 11. Global error handler (LAST)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: config.isProduction ? 'Internal server error' : err.message,
  });
});
```

### Gotcha: Stripe Webhook Raw Body

Stripe signature verification requires the **raw request body**. If `express.json()` runs first, it parses the body and the signature check fails silently. Always mount the webhook route with `express.raw()` BEFORE `express.json()`.

## Entra External ID (CIAM) Authentication

### Key Differences from Workforce Tenants

| Aspect      | Workforce (MCP Server)                                | External ID / CIAM (API)                           |
| ----------- | ----------------------------------------------------- | -------------------------------------------------- |
| Authority   | `login.microsoftonline.com`                           | `{tenant}.ciamlogin.com`                           |
| Issuer      | `login.microsoftonline.com/{tid}/v2.0`                | `{tid}.ciamlogin.com/{tid}/v2.0`                   |
| JWKS URI    | `login.microsoftonline.com/{tid}/discovery/v2.0/keys` | `{tenant}.ciamlogin.com/{tid}/discovery/v2.0/keys` |
| Email claim | `preferred_username`                                  | `emails[0]` or `email`                             |
| Object ID   | `oid`                                                 | `sub` (CIAM uses `sub` as primary)                 |
| Use case    | Internal staff/admin tools                            | Customer-facing portal                             |

### Auth Middleware Implementation

```typescript
export async function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  const token = auth.slice(7);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  try {
    const key = await jwksClient.getSigningKey(decoded.header.kid);
    const payload = jwt.verify(token, key.getPublicKey(), {
      issuer: config.entraExternalId.issuer,
      audience: [`api://${config.entraExternalId.clientId}`, config.entraExternalId.clientId],
      algorithms: ['RS256'],
    });

    // JIT user provisioning — create user on first login
    const entraObjectId = payload.oid ?? payload.sub;
    const email = extractEmail(payload);
    const name = payload.name ?? payload.given_name ?? email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { entraObjectId } });
    if (!user) {
      user = await prisma.user.upsert({
        where: { email },
        update: { entraObjectId, name },
        create: { email, name, entraObjectId },
      });
    }

    req.user = { id: user.id, email: user.email, name: user.name, isStaff: user.isStaff };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

function extractEmail(payload: any): string {
  return (
    payload.emails?.[0] ?? // CIAM format
    payload.email ?? // Standard
    payload.preferred_username ?? // Workforce
    payload.upn
  ); // Legacy
}
```

### JIT Provisioning Gotcha

The `upsert` on email handles the case where a user was invited (created by email) before they ever logged in. On first login, `entraObjectId` is populated from the token's `sub`/`oid` claim. Subsequent lookups use `entraObjectId` directly (faster, indexed).

## RBAC Pattern

### Middleware Factory

```typescript
export function requireOrgRole(...allowedRoles: OrgRole[]) {
  return async (req, res, next) => {
    const orgId = req.params.orgId;

    const membership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this organisation' });
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    req.orgContext = { orgId, role: membership.role };
    next();
  };
}
```

### Role Hierarchy

```typescript
// Organisation management (update, delete, member role changes)
ORG_MANAGEMENT_ROLES: ['owner', 'admin']; // Admins cannot change owner role or transfer ownership
// Member management (invite, remove)
MEMBER_MANAGEMENT_ROLES: ['owner', 'admin'];
BILLING_ROLES: ['owner', 'admin', 'billing'];
TECHNICAL_ROLES: ['owner', 'admin', 'technical'];
SUBSCRIPTION_VIEW_ROLES: ['owner', 'admin', 'billing', 'technical'];
```

### Usage

```typescript
// Owner and admin can update/delete org
router.patch('/:orgId', requireOrgRole('owner', 'admin'), handler);
router.delete('/:orgId', requireOrgRole('owner', 'admin'), handler);

// Owner + admin can manage members and roles
// (admins cannot change owner role or transfer ownership — enforced in handler)
router.patch('/:orgId/members/:userId/role', requireOrgRole('owner', 'admin'), handler);
router.post('/:orgId/members', requireOrgRole('owner', 'admin'), handler);

// All roles can view (empty array = any member)
router.get('/:orgId', requireOrgRole(), handler);
```

### Admin Role Restrictions on Ownership

When admins change member roles, the handler enforces additional guards:

```typescript
const callerRole = req.orgContext!.role;
if (callerRole === 'admin') {
  if (targetMembership.role === 'owner') {
    res.status(403).json({ error: 'Only the owner can change the owner role' });
    return;
  }
  if (newRole === 'owner') {
    res.status(403).json({ error: 'Only the owner can transfer ownership' });
    return;
  }
}
```

### Staff Bypass for Admin Routes

```typescript
export function requireStaff(req, res, next) {
  if (!req.user?.isStaff) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }
  next();
}

// Mount once on the admin router
router.use(authenticate);
router.use(requireStaff);
```

## Stripe Integration

### Webhook Handler Pattern

```typescript
router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).json({ error: 'Missing signature' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event.data.object);
      break;
    case 'invoice.payment_failed':
      await handlePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object);
      break;
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object);
      break;
  }

  res.json({ received: true });
});
```

### Idempotency

Always check if the subscription already exists before creating:

```typescript
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: session.subscription },
  });
  if (existing) return; // Already processed (webhook retry)

  await prisma.$transaction([
    prisma.subscription.create({ ... }),
    prisma.licence.create({ ... }),
  ]);
}
```

### Checkout Session Creation

Pass org metadata so the webhook handler can link the subscription:

```typescript
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  customer: org.stripeCustomerId,
  line_items: [{ price: stripePriceId, quantity: 1 }],
  metadata: { orgId, subscriptionId: newSubId },
  success_url: `${config.portalUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${config.portalUrl}/pricing`,
});
```

## Validation Pattern

Use Zod schemas from the shared package for all mutations:

```typescript
const parsed = createOrgSchema.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({
    error: 'Validation failed',
    details: parsed.error.flatten(), // Field-level errors
  });
  return;
}

const { name } = parsed.data; // Typed and validated
```

## Error Response Conventions

| Status | Meaning             | When                                 |
| ------ | ------------------- | ------------------------------------ |
| 200    | Success             | GET, PATCH                           |
| 201    | Created             | POST (new resource)                  |
| 400    | Bad request         | Validation failure, missing params   |
| 401    | Unauthorized        | Missing/invalid/expired token        |
| 403    | Forbidden           | RBAC denied, not a member, not staff |
| 404    | Not found           | Resource doesn't exist               |
| 409    | Conflict            | Duplicate (e.g., already invited)    |
| 429    | Rate limited        | Too many requests                    |
| 503    | Service unavailable | Optional dependency not configured   |
| 500    | Server error        | Unhandled (production hides details) |

## Config Pattern

Centralize all env vars with fail-fast validation:

```typescript
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  isProduction: process.env.NODE_ENV === 'production',
  entraExternalId: {
    tenantId: requireEnv('ENTRA_EXTERNAL_ID_TENANT_ID'),
    clientId: requireEnv('ENTRA_EXTERNAL_ID_CLIENT_ID'),
    // Use getters for derived URLs
    get issuer() {
      return `https://${this.tenantId}.ciamlogin.com/${this.tenantId}/v2.0`;
    },
    get jwksUri() {
      return `https://${tenant}.ciamlogin.com/${this.tenantId}/discovery/v2.0/keys`;
    },
  },
  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
  },
  portalUrl: optionalEnv('PORTAL_URL', 'http://localhost:5173'),
};
```

## CORS Configuration

```typescript
// Portal (authenticated) — single origin, credentials allowed
const portalCors = cors({
  origin: config.portalUrl,
  credentials: true,
});

// Public API — regex patterns for known consumer domains
const publicCors = cors({
  origin: [/\.powerapps\.com$/, /\.dynamics\.com$/],
});
```

## Rate Limiting

Different limits for different endpoint types:

```typescript
// General API: 1000/hour
const generalLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 1000 });

// Sensitive endpoints (checkin/activation): 10/hour
const checkinLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
```

## Custom ID Formats

```typescript
// Subscription: SUB-XXXXX (URL-safe, human-readable)
const subId = `SUB-${randomBytes(4).toString('hex').toUpperCase()}`;

// Customer: CUST-0001 (auto-incrementing, formatted)
// Prisma: customerId Int @unique @default(autoincrement())
const display = `CUST-${String(org.customerId).padStart(4, '0')}`;
```

## Azure Communication Services (Email)

The email service uses `@azure/communication-email` with graceful degradation — if ACS isn't configured, emails are logged to console.

### Initialization Pattern

```typescript
import { EmailClient } from '@azure/communication-email';
import { config } from '../lib/config.js';

// Conditional initialization — null if ACS not configured
const emailClient = config.email.enabled ? new EmailClient(config.email.connectionString) : null;

const logoUrl = `${config.portalUrl}/assets/logo-black.png`;
```

### Send Pattern

```typescript
async function send(to: string, subject: string, body: string): Promise<void> {
  if (!emailClient) {
    console.log(`[Email] ACS not configured — skipping email to ${to}: ${subject}`);
    return;
  }
  const message = {
    senderAddress: config.email.senderAddress,
    content: { subject, html: emailWrapper(body) },
    recipients: { to: [{ address: to }] },
  };
  const poller = await emailClient.beginSend(message);
  await poller.pollUntilDone();
}
```

### Email Template Pattern

All templates follow this structure — branded HTML wrapper with consistent styling:

```typescript
export async function sendTemplateEmail(
  email: string,
  contextData: string,
): Promise<void> {
  await send(
    email,
    `Subject line with ${contextData}`,
    `<h2 style="margin:0 0 16px;color:#111827">Heading</h2>
    <p style="color:#374151;line-height:1.6">Body text with <strong>${contextData}</strong>.</p>
    <p><a href="${link}" style="display:inline-block;padding:12px 28px;background:#0891b2;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">CTA Button</a></p>`,
  );
}
```

### Config Pattern

```typescript
email: {
  connectionString: optionalEnv('ACS_CONNECTION_STRING', ''),
  senderAddress: optionalEnv('ACS_SENDER_ADDRESS', 'no-reply@{{ORG_SCOPE}}.com.au'),
  get enabled() { return !!config.email.connectionString; },
},
```

### Existing Templates

| Function | Trigger | Recipients |
| -------- | ------- | ---------- |
| `sendOrgInvitation` | User invited to org | Invitee |
| `sendTicketReplyNotification` | Staff replies to ticket | Ticket creator |
| `sendTicketCreatedNotification` | Customer creates ticket | Escalation contacts |
| `sendTicketAssignedNotification` | Ticket assigned | Assigned staff |
| `sendContactFormNotification` | Contact form submitted | Staff recipients |
| `sendSlaWarningNotification` | SLA approaching breach (cron) | Escalation + assignee |
| `sendSlaBreachNotification` | SLA breached (cron) | Escalation + assignee |
| `sendVersionReleaseNotification` | New product version (cron) | Licensed users |

## Cron / Scheduled Jobs Pattern

Background jobs are implemented as a **secret-protected HTTP endpoint** called by an external scheduler — not `setInterval` or in-process timers. This ensures jobs survive restarts and can be triggered independently.

### Endpoint Pattern

```typescript
app.post('/api/cron/run', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!secret || secret !== config.cronSecret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const [sla, versions] = await Promise.all([
    checkSlaNotifications(),
    notifyNewVersions(),
  ]);

  console.log(`[Cron] SLA: ${sla.warnings} warnings, ${sla.breaches} breaches | Versions: ${versions} notified`);
  res.json({ sla, versionsNotified: versions, timestamp: new Date().toISOString() });
});
```

### Key Design Decisions

- **External scheduler** (not `setInterval`): Container Apps can restart at any time; in-process timers reset on restart
- **Secret protection**: Simple shared secret via `x-cron-secret` header — sufficient for server-to-server calls within Azure
- **Idempotent**: Both jobs use database flags to prevent duplicate processing (SlaNotificationLog unique constraint, ProductVersion.notifiedAt)
- **Combined endpoint**: All periodic jobs run from a single endpoint for simplicity — add new jobs to the `Promise.all`
- **Recommended frequency**: Every 15 minutes for SLA monitoring

### Adding a New Cron Job

1. Create service in `packages/api/src/services/` with idempotent function
2. Add to the `Promise.all` in `/api/cron/run`
3. Return structured result for logging

## Docker Build — API

```dockerfile
# Stripe webhook route needs raw body — no reverse proxy body parsing
# Health check endpoint: GET /health (no auth, for load balancer probes)
# Non-root user in production
RUN groupadd -r apiuser && useradd -r -g apiuser -d /app apiuser
USER apiuser
```
