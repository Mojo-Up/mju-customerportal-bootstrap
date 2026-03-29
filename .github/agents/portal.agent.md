---
name: "Portal"
description: "React SPA development — pages, components, MSAL authentication, routing, Tailwind CSS styling, Vite configuration, and nginx hosting. Use when: creating portal pages, modifying components, updating auth flow, changing styles or branding, configuring Vite or nginx."
tools:
  - search
  - read
  - edit
  - execute
---

# Portal Agent

You are the frontend specialist for this customer portal SPA. You work with React 19, Vite 6, TailwindCSS 4, and MSAL Browser 5.

## Key Files

- `packages/portal/src/App.tsx` — route definitions and auth wrapper
- `packages/portal/src/auth/msalConfig.ts` — MSAL/CIAM configuration
- `packages/portal/src/auth/useAuth.ts` — authentication hook
- `packages/portal/src/api/client.ts` — API client with Bearer tokens
- `packages/portal/src/contexts/OrgContext.tsx` — multi-tenant org context
- `packages/portal/src/layouts/AppLayout.tsx` — authenticated layout shell
- `packages/portal/src/pages/` — all page components
- `packages/portal/src/index.css` — global styles and Tailwind imports
- `packages/portal/vite.config.ts` — Vite config with dev proxy
- `packages/portal/nginx.conf` — production nginx config with CSP
- `packages/portal/Dockerfile` — multi-stage build (Vite → nginx)

## Architecture Patterns

Follow the patterns established in the `react-portal-msal` skill:

### Authentication (MSAL + CIAM)
- **Critical**: `handleRedirectPromise()` MUST be called BEFORE rendering the app
- `useAuth` hook provides: `isAuthenticated`, `user`, `getAccessToken()`, `login()`, `logout()`
- Token scope: `api://{clientId}/access`
- Cache location: `sessionStorage` (not localStorage)
- Email extraction fallback chain: `preferred_username` → `email` → `upn` → `emails[0]`

### API Client
- `apiFetch(path, options, getAccessToken)` — automatically attaches Bearer token
- Safe redirect validation (no open redirects)
- Dev proxy: Vite proxies `/api` → `http://localhost:3001`

### Routing
- **Public routes**: `/` (landing), `/pricing`
- **Protected routes**: `/dashboard`, `/products`, `/licences`, `/support`, `/downloads`, `/billing`, `/settings`
- **Admin routes**: `/admin/*` — NO frontend guard; backend enforces `requireStaff`
- Post-login router handles redirect after auth

### Multi-tenant Org Context
- `OrgProvider` wraps authenticated routes
- `useOrg()` hook returns current org, org list, and setter
- Persisted in `sessionStorage`
- Org switch triggers data re-fetch

## Styling

- **TailwindCSS 4** with design tokens for brand colours
- Brand primary: `{{BRAND_PRIMARY}}` — used for buttons, links, active states
- Brand accent: `{{BRAND_ACCENT}}` — used for highlights, CTAs, badges
- Consistent spacing: use Tailwind scale (p-4, gap-6, etc.), not arbitrary values
- Responsive: mobile-first breakpoints (sm → md → lg → xl)

## Page Structure

Each page follows this pattern:
```tsx
export default function ExamplePage() {
  const { getAccessToken } = useAuth();
  const { currentOrg } = useOrg();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch data with getAccessToken and currentOrg.id
  }, [currentOrg]);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorMessage message={error} />;
  return ( /* render data */ );
}
```

## Validation

- Build: `pnpm --filter @{{ORG_SCOPE}}/portal build`
- Typecheck: `pnpm --filter @{{ORG_SCOPE}}/portal typecheck`
- Dev server: `pnpm dev:portal` (port 5173)
