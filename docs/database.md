# Database

## Overview

The {{PROJECT_NAME}} Customer Portal uses PostgreSQL 16 via Azure Database for PostgreSQL Flexible Server, accessed through Prisma ORM. The database stores all organisation, user, subscription, licence, support, and download data.

## Entity Relationship Diagram

```mermaid
erDiagram
    Organisation ||--o{ OrgMembership : "has members"
    Organisation ||--o{ OrgInvitation : "has invitations"
    Organisation ||--o{ Subscription : "has subscriptions"
    Organisation ||--o{ Licence : "has licences"
    Organisation ||--o{ SupportTicket : "has tickets"
    Organisation ||--o{ DownloadLog : "has download logs"

    User ||--o{ OrgMembership : "belongs to orgs"
    User ||--o{ SupportTicket : "creates tickets"
    User ||--o{ TicketMessage : "writes messages"
    User ||--o{ DownloadLog : "downloads files"

    Product ||--o{ ProductPricingPlan : "has pricing plans"
    Product ||--o{ Subscription : "has subscriptions"
    Product ||--o{ Licence : "has licences"
    Product ||--o{ FileDownload : "has downloads"
    Product ||--o{ SupportTicket : "has tickets"

    Subscription ||--o{ Licence : "grants licences"

    Licence ||--o{ Environment : "has environments"
    Licence ||--o{ ActivationCode : "generates codes"

    Environment ||--o{ ActivationCode : "has codes"

    SupportTicket ||--o{ TicketMessage : "has messages"

    FileDownload ||--o{ DownloadLog : "has logs"

    Organisation {
        uuid id PK
        int customerId UK "auto-increment"
        string name
        string stripeCustomerId UK
    }

    User {
        uuid id PK
        string email UK
        string name
        string entraObjectId UK
        boolean isStaff
    }

    Product {
        uuid id PK
        string name UK
        string slug UK
        text description
        boolean isActive
        json features
    }

    ProductPricingPlan {
        uuid id PK
        uuid productId FK
        string name
        string stripePriceId
        string interval "month or year"
        int price "cents"
        string currency
        json features
    }

    Subscription {
        string id PK "SUB-xxxx"
        uuid orgId FK
        uuid productId FK
        enum plan "monthly or annual"
        enum status "active, expired, cancelled, past_due"
        datetime startDate
        datetime endDate
        string stripeSubscriptionId UK
    }

    Licence {
        uuid id PK
        uuid orgId FK
        uuid productId FK
        enum type "subscription, time_limited, unlimited"
        string subscriptionId FK
        datetime expiryDate
        int maxEnvironments
    }

    Environment {
        uuid id PK
        uuid licenceId FK
        string environmentCode "hex format"
        string name
        datetime activatedAt
    }

    ActivationCode {
        uuid id PK
        uuid environmentId FK
        uuid licenceId FK
        int licenceType "100000001, 100000002, 100000003"
        text code "HMAC-signed"
        datetime endDate
    }

    OrgMembership {
        uuid userId PK,FK
        uuid orgId PK,FK
        enum role "owner, admin, billing, technical"
        uuid invitedBy FK
    }

    OrgInvitation {
        uuid id PK
        uuid orgId FK
        string email
        enum role
        uuid token UK
        datetime expiresAt
    }

    SupportTicket {
        uuid id PK
        uuid orgId FK
        uuid productId FK
        uuid userId FK
        string subject
        enum status "open, in_progress, resolved, closed"
        enum priority "low, medium, high"
    }

    TicketMessage {
        uuid id PK
        uuid ticketId FK
        uuid userId FK
        text body
        boolean isInternal
    }

    FileDownload {
        uuid id PK
        uuid productId FK
        string name
        enum category "solution, powerbi, guide"
        string version
        string blobPath
        bigint fileSize
    }

    DownloadLog {
        uuid id PK
        uuid fileId FK
        uuid userId FK
        uuid orgId FK
        datetime downloadedAt
    }
```

## Tables

### Core Business

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `organisations` | Customer organisations, each with a unique `customer_id` and optional Stripe customer | Parent of memberships, subscriptions, licences, tickets |
| `products` | Product catalogue (e.g. {{PRODUCT_NAME}}) with slug, description, features JSON | Parent of pricing plans, subscriptions, licences, downloads |
| `product_pricing_plans` | Per-product pricing (Stripe price IDs, interval, price in cents) | Belongs to product |
| `subscriptions` | Active billing relationships, synced from Stripe webhooks | Belongs to org + product, grants licences |
| `licences` | Entitlements (subscription-linked, time-limited, or unlimited) | Belongs to org + product, optionally linked to subscription |
| `environments` | Registered product installations (environment code = hardware fingerprint) | Belongs to licence |
| `activation_codes` | Audit trail of HMAC-signed activation codes generated | Belongs to environment + licence |

### Users & Access

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `users` | All portal users, linked to Entra via `entra_object_id` | Member of organisations via `org_memberships` |
| `org_memberships` | Organisation membership with role (owner/admin/billing/technical) | Composite PK: `user_id` + `org_id` |
| `org_invitations` | Pending invitations with token and expiry | Belongs to organisation |

### Support & Downloads

| Table | Description | Key Relationships |
|-------|-------------|-------------------|
| `support_tickets` | Customer support requests with status and priority | Belongs to org + product + user |
| `ticket_messages` | Messages within a ticket (supports internal staff notes) | Belongs to ticket + user |
| `file_downloads` | Downloadable files stored in Azure Blob Storage | Belongs to product |
| `download_logs` | Audit log of all file downloads | Belongs to file + user + org |

## Enums

```mermaid
graph LR
    subgraph OrgRole
        owner
        admin
        billing
        technical
    end

    subgraph SubscriptionPlan
        monthly
        annual
    end

    subgraph SubscriptionStatus
        active
        expired
        cancelled
        past_due
    end

    subgraph LicenceRecordType
        subscription_type["subscription"]
        time_limited
        unlimited
    end

    subgraph TicketStatus
        open
        in_progress
        resolved
        closed
    end

    subgraph TicketPriority
        low
        medium
        high
    end

    subgraph DownloadCategory
        solution
        powerbi
        guide
    end
```

## Indexes

Key indexes beyond primary keys:

| Table | Columns | Purpose |
|-------|---------|---------|
| `organisations` | `customer_id` (unique) | Look up by numeric customer ID |
| `organisations` | `stripe_customer_id` (unique) | Look up by Stripe customer |
| `users` | `email` (unique) | JIT provisioning, invitations |
| `users` | `entra_object_id` (unique) | Token-based authentication |
| `subscriptions` | `org_id` | Org subscription list |
| `subscriptions` | `product_id` | Product subscription list |
| `subscriptions` | `stripe_subscription_id` (unique) | Webhook event handling |
| `licences` | `org_id`, `product_id`, `subscription_id` | Licence lookups |
| `environments` | `licence_id` + `environment_code` (unique) | Prevent duplicate registrations |
| `org_invitations` | `email`, `token` (unique) | Invitation acceptance |
| `support_tickets` | `org_id`, `product_id`, `user_id` | Ticket filtering |
| `ticket_messages` | `ticket_id` | Message retrieval |
| `file_downloads` | `product_id` | Product download list |
| `download_logs` | `file_id`, `user_id`, `org_id` | Audit queries |
| `activation_codes` | `environment_id`, `licence_id` | Code history |

## Migrations

Migrations are managed by Prisma Migrate and stored in `packages/api/prisma/migrations/`:

| Migration | Description |
|-----------|-------------|
| `0001_init` | Initial schema: all tables, indexes, and enums |
| `0002_remove_slug_add_customer_id` | Replace org slug with auto-increment `customer_id` |

### Running Migrations

```bash
# Development: create and apply a new migration
cd packages/api
npx prisma migrate dev --name <migration_name>

# Production: apply pending migrations (no prompts)
npx prisma migrate deploy
```

### Migration Flow

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant Prisma as Prisma CLI
    participant DB as PostgreSQL

    Dev->>Prisma: prisma migrate dev --name <name>
    Prisma->>Prisma: Diff schema.prisma vs DB
    Prisma->>Prisma: Generate SQL migration file
    Prisma->>DB: Apply migration
    Prisma->>Prisma: Update _prisma_migrations table
    Prisma->>Dev: Migration applied

    Note over Dev,DB: Production (CI/CD)

    Dev->>Prisma: prisma migrate deploy
    Prisma->>DB: Apply all pending migrations
    Prisma->>DB: Record in _prisma_migrations
```

## Activation Code Structure

Activation codes use HMAC-SHA256 signing. The code format is `Base64URL(payload).Base64URL(signature)`.

```mermaid
graph TD
    A[Environment Code] --> B[Normalise to 16-char hex]
    B --> C{Licence Type?}
    C -->|Subscription| D["fingerprint|100000003|subId|endDate"]
    C -->|Time Limited| E["fingerprint|100000001|expiryDate"]
    C -->|Unlimited| F["fingerprint|100000002|unlimited"]
    D --> G[HMAC-SHA256 Sign with key]
    E --> G
    F --> G
    G --> H["Base64URL(payload).Base64URL(signature)"]
```

## Multi-Tenancy Model

```mermaid
graph TD
    subgraph Organisation["Organisation (tenant boundary)"]
        Members["Members (users + roles)"]
        Subs["Subscriptions (Stripe-synced)"]
        Lics["Licences (entitlements)"]
        Tix["Support Tickets"]
        DL["Download Logs"]
    end

    subgraph Shared["Shared across tenants"]
        Products["Products & Pricing"]
        Files["File Downloads"]
        Users["User accounts"]
    end

    Users -->|membership| Members
    Products -->|subscription| Subs
    Subs -->|grants| Lics
    Products -->|scoped to| Files
```

All billable resources (subscriptions, licences, tickets, download logs) are scoped to an Organisation. Users can belong to multiple organisations. Products and file downloads are shared across all tenants.
