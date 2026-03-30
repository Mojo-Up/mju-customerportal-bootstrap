---
name: prisma-stripe-saas
description: 'Design Prisma schemas for multi-tenant SaaS with Stripe billing, licence management, environment activation with HMAC codes, support tickets with SLA, knowledge base, testimonials, and subscription lifecycle. The current schema has 26 models, 12 enums, and 19 migrations. Use when: designing Prisma schema for SaaS, integrating Stripe subscriptions with database, building licence/activation systems, managing multi-tenant data isolation, handling Stripe webhook-driven state sync.'
---

# Prisma Schema for Multi-Tenant SaaS with Stripe

Design and implement Prisma schemas for multi-tenant SaaS products with Stripe billing, licence management, and activation code generation.

## When to Use

- Designing a new SaaS database schema
- Adding Stripe subscription tracking to Prisma
- Building licence/activation code systems
- Implementing multi-tenant data isolation with org membership
- Syncing Stripe webhook events to database state

## Schema Design Principles

### Multi-Tenancy via Organisation

Organisation is the root aggregate. All business data hangs off it:

```prisma
model Organisation {
  id               String   @id @default(uuid()) @db.Uuid
  customerId       Int      @unique @default(autoincrement()) // Human-friendly: CUST-0001
  name             String
  stripeCustomerId String?  @unique  // Created on first checkout
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  memberships   OrgMembership[]
  subscriptions Subscription[]
  licences      Licence[]
  tickets       SupportTicket[]
}
```

**Key decisions**:

- `customerId` is auto-incrementing for human-friendly display (`CUST-0001`)
- `stripeCustomerId` is nullable — created lazily when user first subscribes
- UUID primary keys everywhere for security (non-enumerable)

### User & Membership

Users can belong to multiple orgs with different roles:

```prisma
model User {
  id             String   @id @default(uuid()) @db.Uuid
  email          String   @unique
  name           String
  entraObjectId  String?  @unique  // Populated on first login (JIT)
  isStaff        Boolean  @default(false)
  createdAt      DateTime @default(now())

  memberships OrgMembership[]
}

model OrgMembership {
  userId    String   @db.Uuid
  orgId     String   @db.Uuid
  role      OrgRole  // owner | admin | billing | technical
  invitedBy String?  @db.Uuid
  acceptedAt DateTime?
  createdAt DateTime @default(now())

  user User         @relation(fields: [userId], references: [id])
  org  Organisation @relation(fields: [orgId], references: [id])

  @@id([userId, orgId])  // Composite PK — one membership per user per org
}

enum OrgRole {
  owner
  admin
  billing
  technical
}
```

**Gotcha**: `entraObjectId` is nullable because users can be invited (created by email) before they ever log in. On first login, the auth middleware populates this via `upsert`.

### Invitation System

```prisma
model OrgInvitation {
  id        String    @id @default(uuid()) @db.Uuid
  orgId     String    @db.Uuid
  email     String
  role      OrgRole
  token     String    @unique @default(uuid())  // Secure invite link token
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime  @default(now())

  org Organisation @relation(fields: [orgId], references: [id])

  @@unique([orgId, email])  // One active invite per email per org
}
```

## Stripe Subscription Tracking

### Subscription Model

```prisma
model Subscription {
  id                   String             @id  // Custom format: SUB-XXXXX
  orgId                String             @db.Uuid
  productId            String?            @db.Uuid
  plan                 SubscriptionPlan
  status               SubscriptionStatus
  startDate            DateTime
  endDate              DateTime
  stripeSubscriptionId String?            @unique
  stripePriceId        String?
  createdAt            DateTime           @default(now())
  updatedAt            DateTime           @updatedAt

  org     Organisation @relation(fields: [orgId], references: [id])
  licence Licence?     // 1:1 relationship
}

enum SubscriptionStatus {
  active
  past_due
  cancelled
  expired
}

enum SubscriptionPlan {
  monthly
  annual
}
```

**Design decisions**:

- Custom `SUB-XXXXX` ID format (not UUID) — human-readable in admin UI and Stripe metadata
- `stripeSubscriptionId` is nullable for manual/complimentary subscriptions
- Status is synced FROM Stripe webhooks (source of truth is Stripe)

### Subscription ID Generation

```typescript
import { randomBytes } from 'node:crypto';
const subId = `SUB-${randomBytes(4).toString('hex').toUpperCase()}`; // SUB-A1B2C3D4
```

### Webhook → Database Sync

| Stripe Event                    | DB Action                         |
| ------------------------------- | --------------------------------- |
| `checkout.session.completed`    | Create Subscription + Licence     |
| `invoice.paid`                  | Set status=active, update endDate |
| `invoice.payment_failed`        | Set status=past_due               |
| `customer.subscription.deleted` | Set status=cancelled              |
| `customer.subscription.updated` | Sync status + endDate             |

Always use transactions for atomic multi-table writes:

```typescript
await prisma.$transaction([
  prisma.subscription.create({
    data: { id: subId, orgId, status: 'active', stripeSubscriptionId, ... },
  }),
  prisma.licence.create({
    data: { orgId, subscriptionId: subId, type: 'subscription', maxEnvironments: 5 },
  }),
]);
```

## Licence & Environment Activation

### Schema

```prisma
model Licence {
  id              String           @id @default(uuid()) @db.Uuid
  orgId           String           @db.Uuid
  type            LicenceRecordType
  subscriptionId  String?          @unique  // 1:1 with Subscription
  expiryDate      DateTime?
  maxEnvironments Int              @default(5)
  createdAt       DateTime         @default(now())

  org            Organisation      @relation(fields: [orgId], references: [id])
  subscription   Subscription?     @relation(fields: [subscriptionId], references: [id])
  environments   Environment[]
  activationCodes ActivationCode[]
}

model Environment {
  id              String    @id @default(uuid()) @db.Uuid
  licenceId       String    @db.Uuid
  environmentCode String    // XXXX-XXXX-XXXX-XXXX (16 hex)
  name            String?
  activatedAt     DateTime?
  createdAt       DateTime  @default(now())

  licence         Licence   @relation(fields: [licenceId], references: [id])
  activationCodes ActivationCode[]

  @@unique([licenceId, environmentCode])  // One code per licence
}

enum LicenceRecordType {
  subscription
  time_limited
  unlimited
}
```

### HMAC Activation Code Generation

Activation codes are deterministic HMAC-SHA256 signatures — the same inputs always produce the same code:

```typescript
function generateActivationCode(
  environmentCode: string,
  licenceType: LicenceType,
  endDate?: Date,
): string {
  // Normalize fingerprint: strip hyphens, lowercase
  const fingerprint = environmentCode.replace(/-/g, '').toLowerCase();

  // Build payload
  const parts = [fingerprint, String(licenceType)];
  if (endDate) {
    const d = new Date(endDate);
    d.setUTCHours(23, 59, 59, 0); // End of day UTC
    parts.push(d.toISOString());
  }

  const payload = parts.join('|');
  const hmac = createHmac('sha256', HMAC_KEY).update(payload).digest();
  return base64UrlEncode(hmac);
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); // Strip padding
}
```

**Gotchas**:

- Fingerprint normalization MUST match client-side code exactly
- End date is set to 23:59:59 UTC to ensure full-day validity
- Base64URL encoding (not standard base64) — no `+`, `/`, or `=` padding
- HMAC key change invalidates ALL existing activation codes

### Activation Code Audit Trail

```prisma
model ActivationCode {
  id            String   @id @default(uuid()) @db.Uuid
  environmentId String   @db.Uuid
  licenceId     String   @db.Uuid
  licenceType   Int      // Matches Dataverse picklist values
  code          String
  endDate       DateTime?
  createdAt     DateTime @default(now())

  environment Environment @relation(fields: [environmentId], references: [id])
  licence     Licence     @relation(fields: [licenceId], references: [id])
}
```

Every activation code generated is recorded for audit purposes.

## Query Patterns

### Efficient Includes

```typescript
// Use select to limit returned fields
const org = await prisma.organisation.findUnique({
  where: { id: orgId },
  include: {
    memberships: {
      include: { user: { select: { id: true, email: true, name: true } } },
    },
    subscriptions: { orderBy: { endDate: 'desc' } },
    licences: { include: { environments: true } },
    _count: { select: { memberships: true } },
  },
});
```

### Case-Insensitive Search

```typescript
const orgs = await prisma.organisation.findMany({
  where: {
    name: { contains: search, mode: 'insensitive' },
  },
  take: limit,
});
```

### Atomic Dashboard Stats

Use `$transaction` for consistent point-in-time reads:

```typescript
const [orgCount, userCount, activeSubs, totalSubs] = await prisma.$transaction([
  prisma.organisation.count(),
  prisma.user.count(),
  prisma.subscription.count({ where: { status: 'active' } }),
  prisma.subscription.count(),
]);
```

### Products with Pricing Plans

```prisma
model Product {
  id          String  @id @default(uuid()) @db.Uuid
  name        String
  slug        String  @unique
  description String
  iconUrl     String?
  isActive    Boolean @default(true)
  features    Json?   // String array stored as JSON
  sortOrder   Int     @default(0)

  pricingPlans ProductPricingPlan[]
}

model ProductPricingPlan {
  id           String  @id @default(uuid()) @db.Uuid
  productId    String  @db.Uuid
  name         String
  stripePriceId String @unique
  interval     String  // 'month' | 'year'
  price        Int     // Cents (e.g., 2999 = $29.99)
  currency     String  @default("aud")
  features     Json?
  isActive     Boolean @default(true)
  sortOrder    Int     @default(0)

  product Product @relation(fields: [productId], references: [id])
}
```

**Gotcha**: Prices stored in cents (integer) to avoid floating-point issues.

## Support Ticket Schema

```prisma
model SupportTicket {
  id        String         @id @default(uuid()) @db.Uuid
  orgId     String         @db.Uuid
  userId    String         @db.Uuid
  subject   String
  status    TicketStatus   @default(open)
  priority  TicketPriority @default(medium)
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt

  org      Organisation   @relation(fields: [orgId], references: [id])
  user     User           @relation(fields: [userId], references: [id])
  messages TicketMessage[]
}

model TicketMessage {
  id         String   @id @default(uuid()) @db.Uuid
  ticketId   String   @db.Uuid
  userId     String   @db.Uuid
  body       String
  isInternal Boolean  @default(false)  // Staff-only messages
  createdAt  DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticketId], references: [id])
  user   User          @relation(fields: [userId], references: [id])
}
```

**`isInternal`**: Staff can add internal notes not visible to customers. Filter by `isInternal: false` in customer-facing queries.

## Migration Strategy

Name migrations descriptively:

```
prisma/migrations/
  0001_init/migration.sql
  0002_remove_slug_add_customer_id/migration.sql
```

In Docker, generate client (not migrate) — migrations run separately:

```dockerfile
RUN cd packages/api && npx prisma generate
```

Run migrations in CI/CD or a separate init container, not at app startup.

## File Downloads with Azure Blob Storage

```prisma
model FileDownload {
  id          String           @id @default(uuid()) @db.Uuid
  productId   String           @db.Uuid
  name        String
  description String
  category    DownloadCategory
  version     String
  blobPath    String           // Azure Blob Storage path
  fileSize    Int
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt

  product Product @relation(fields: [productId], references: [id])
}
```

Generate SAS URLs for secure, time-limited downloads rather than proxying the blob through the API.
