---
description: 'Prisma schema conventions — multi-tenant design, composite keys, custom IDs, enum patterns, index strategy, migration workflow. Use when: editing Prisma schema files.'
applyTo: '**/*.prisma'
---

# Prisma Schema Conventions

## Multi-Tenancy

- Organisation is the root aggregate — all tenant data scoped by `organisationId`
- Always add `@@index([organisationId])` on tenant-scoped models
- Never allow cross-tenant data access in queries

## Naming

- Models: PascalCase singular (`Organisation`, `SupportTicket`)
- Fields: camelCase (`createdAt`, `stripeCustomerId`)
- Enums: PascalCase with UPPER_CASE values (`enum OrgRole { OWNER ADMIN BILLING TECHNICAL }`)

## Required Fields

- `id`: String `@id @default(cuid())` or custom format
- `createdAt`: DateTime `@default(now())`
- `updatedAt`: DateTime `@updatedAt`

## Relationships

- Use `@@id([field1, field2])` for composite PKs (join tables)
- Add `@@index` on foreign key fields for query performance
- Use `@unique` for natural keys (email, Stripe IDs)

## Migration Workflow

1. Edit schema → `npx prisma migrate dev --name descriptive_name`
2. `pnpm db:generate` to regenerate client
3. Update shared types in `packages/shared/src/types/`
4. Run `pnpm typecheck` to catch ripple effects
5. Never edit existing migration files
