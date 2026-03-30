---
description: 'Add a new Express API route with proper middleware, validation, and RBAC.'
agent: 'api'
argument-hint: 'Describe the API endpoint (method, path, purpose)'
---

Add a new API route following the established Express patterns:

1. Create or update the route handler in `packages/api/src/routes/`
2. Add Zod input validation schema in `packages/shared/src/validation/schemas.ts`
3. Add response types in `packages/shared/src/types/`
4. Apply appropriate middleware (auth, RBAC, rate limiting)
5. Mount the route in `packages/api/src/index.ts` at the correct position
6. Run `pnpm typecheck` and `pnpm lint` to verify

Endpoint: ${input:endpoint_description}
