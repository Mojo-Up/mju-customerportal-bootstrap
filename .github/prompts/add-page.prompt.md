---
description: 'Add a new React page to the portal with routing, data fetching, loading/error states, and consistent Tailwind styling.'
agent: 'portal'
argument-hint: 'Describe the page (name, purpose, data it displays)'
---

Add a new portal page following the established React patterns:

1. Create the page component in `packages/portal/src/pages/`
2. Add the route in `packages/portal/src/App.tsx`
3. Add navigation link in `packages/portal/src/layouts/AppLayout.tsx` (if applicable)
4. Implement data fetching with `useAuth` and `useOrg` hooks
5. Include loading skeleton and error states
6. Use Tailwind design tokens for consistent styling
7. Run `pnpm --filter @{{ORG_SCOPE}}/portal build` to verify

Page: ${input:page_description}
