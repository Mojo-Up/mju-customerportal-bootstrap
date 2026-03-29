---
name: react-portal-msal
description: 'Build React SPA portals with MSAL authentication (Entra External ID / CIAM), multi-tenant org context, API client with Bearer tokens, admin routing, Vite config with dev proxy, Tailwind CSS, and nginx SPA hosting. Use when: creating React portal with MSAL, debugging CIAM auth in SPA, building multi-tenant UI with org switcher, configuring Vite proxy for API, setting up nginx for SPA.'
---

# React Portal with MSAL & Multi-Tenant Org Context

Build production React SPAs with MSAL authentication against Entra External ID (CIAM), organization-scoped multi-tenancy, and Tailwind CSS.

## When to Use

- Creating a new React portal with MSAL authentication
- Adding org context / multi-tenancy to a React app
- Debugging CIAM token issues in the browser
- Configuring Vite dev proxy for API access
- Setting up nginx to serve a React SPA

## MSAL Configuration

### Key Gotchas

1. **CIAM authority format**: `https://{tenant}.ciamlogin.com/` — NOT the standard `login.microsoftonline.com`
2. **Known authorities**: Must list the CIAM domain explicitly or MSAL rejects it
3. **Session storage, not local storage**: Use `sessionStorage` for token cache (cleared on browser close — more secure)
4. **API scope format**: `api://{clientId}/access` — the custom scope exposed by your backend API app registration

```typescript
import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

const tenant = import.meta.env.VITE_ENTRA_EXTERNAL_ID_TENANT;
const clientId = import.meta.env.VITE_ENTRA_EXTERNAL_ID_CLIENT_ID;

export const msalConfig = {
  auth: {
    clientId,
    authority: `https://${tenant}.ciamlogin.com/`,
    knownAuthorities: [`${tenant}.ciamlogin.com`],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage', // NOT localStorage
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message) => console.warn(message),
    },
  },
};

export const loginRequest = {
  scopes: [`api://${clientId}/access`],
};

export const msalInstance = new PublicClientApplication(msalConfig);
```

### Initialization Sequence (Critical)

MSAL must fully initialize before React renders. Handle the redirect promise FIRST:

```typescript
// main.tsx
async function boot() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise(); // Process auth redirect if returning from login

  const root = ReactDOM.createRoot(document.getElementById('root')!);
  root.render(
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  );
}

boot();
```

**Gotcha**: If you render before `handleRedirectPromise()` resolves, components may see unauthenticated state briefly, causing flicker or redirect loops.

## useAuth Hook

```typescript
import { useMsal } from '@azure/msal-react';
import { loginRequest } from './msalConfig';

export function useAuth() {
  const { instance, accounts } = useMsal();
  const account = accounts[0] ?? null;

  const getAccessToken = async (): Promise<string> => {
    if (!account) throw new Error('Not authenticated');
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  };

  const login = () => instance.loginRedirect(loginRequest);
  const logout = () => instance.logoutRedirect();

  // Email extraction — CIAM uses different claim names
  const email = account
    ? ((account.idTokenClaims as any)?.emails?.[0] ?? // CIAM format
      (account.idTokenClaims as any)?.email ?? // Standard
      (account.idTokenClaims as any)?.preferred_username ?? // Workforce
      account.username) // Fallback
    : null;

  return { account, email, isAuthenticated: !!account, getAccessToken, login, logout };
}
```

### Token Refresh Gotcha

MSAL handles silent refresh automatically using a hidden iframe. But if the refresh token expires (typically 14+ days inactive), `acquireTokenSilent` throws an `InteractionRequiredAuthError`. Handle it:

```typescript
try {
  const response = await instance.acquireTokenSilent({ ...loginRequest, account });
  return response.accessToken;
} catch (err) {
  if (err instanceof InteractionRequiredAuthError) {
    await instance.loginRedirect(loginRequest); // Force re-login
  }
  throw err;
}
```

## API Client Pattern

```typescript
const API_BASE = import.meta.env.VITE_API_URL || '';

export function useApi() {
  const { getAccessToken } = useAuth();

  async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getAccessToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }

    return res.json();
  }

  return { apiFetch };
}
```

### Redirect URL Safety

Before redirecting to external URLs (e.g., Stripe checkout), validate them:

```typescript
function isSafeRedirectUrl(url: string, allowedDomains: string[] = []): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (allowedDomains.length > 0) {
      return allowedDomains.some((d) => parsed.hostname.endsWith(d));
    }
    return true;
  } catch {
    return false;
  }
}

// Usage
if (isSafeRedirectUrl(data.url, ['stripe.com'])) {
  window.location.href = data.url;
}
```

## Multi-Tenant Org Context

```typescript
interface OrgContextType {
  orgs: Organisation[];
  currentOrg: Organisation | null;
  setCurrentOrg: (org: Organisation) => void;
  loading: boolean;
}

export function OrgProvider({ children }) {
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Organisation | null>(null);
  const [loading, setLoading] = useState(true);
  const { apiFetch } = useApi();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;

    apiFetch<Organisation[]>('/api/organisations')
      .then((data) => {
        setOrgs(data);
        // Restore from session or pick first
        const savedId = sessionStorage.getItem('currentOrgId');
        const saved = data.find((o) => o.id === savedId);
        setCurrentOrgState(saved ?? data[0] ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  const setCurrentOrg = (org: Organisation) => {
    setCurrentOrgState(org);
    sessionStorage.setItem('currentOrgId', org.id);
  };

  return (
    <OrgContext.Provider value={{ orgs, currentOrg, setCurrentOrg, loading }}>
      {children}
    </OrgContext.Provider>
  );
}
```

**Design decision**: `sessionStorage` (not `localStorage`) means org context resets on browser close. Use `localStorage` if you want persistence across sessions.

## Routing Pattern

```typescript
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Protected routes (require auth) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/licences" element={<LicencesPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/settings" element={<OrgSettingsPage />} />

            {/* Admin routes — backend enforces isStaff */}
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/products" element={<AdminProductsPage />} />
            <Route path="/admin/organisations" element={<AdminOrganisationsPage />} />
            <Route path="/admin/organisations/:orgId" element={<AdminOrgDetailPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function ProtectedRoute() {
  return (
    <AuthenticatedTemplate>
      <OrgProvider>
        <Outlet />
      </OrgProvider>
    </AuthenticatedTemplate>
  );
}
```

**Important**: Admin routes have NO frontend guard — the backend API enforces `requireStaff`. The frontend only hides the admin nav link for non-staff users. This is the correct pattern (never rely solely on frontend auth checks).

## Data Fetching Pattern

```typescript
function SomePage() {
  const { apiFetch } = useApi();
  const { currentOrg } = useOrg();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentOrg) return;
    apiFetch<T>(`/api/organisations/${currentOrg.id}/resource`)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  if (loading) return <p className="p-6 text-gray-500">Loading...</p>;
  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!data) return null;

  return <div>...</div>;
}
```

### Known Improvements to Consider

- Add `AbortController` for request cancellation on unmount
- Add global error boundary for uncaught errors
- Consider `react-query` / `swr` for caching and deduplication
- Add skeleton loading states instead of "Loading..." text

## Vite Configuration

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3001' },
    },
  },
});
```

**Dev proxy** eliminates CORS issues during development. In production, nginx handles routing.

**Build args** are compile-time constants — they're embedded in the JS bundle and can't be changed at runtime:

```dockerfile
ARG VITE_API_URL
ARG VITE_ENTRA_EXTERNAL_ID_TENANT
ARG VITE_ENTRA_EXTERNAL_ID_CLIENT_ID
RUN pnpm --filter @{{ORG_SCOPE}}/portal build
```

## Nginx SPA Configuration

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # SPA fallback — all routes serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;

    # CSP — allow CIAM auth domains and API
    add_header Content-Security-Policy "
        default-src 'self';
        script-src 'self';
        style-src 'self' 'unsafe-inline';
        connect-src 'self' *.{{DOMAIN}} *.ciamlogin.com;
        frame-src *.ciamlogin.com;
        img-src 'self' data:;
    " always;

    # Cache immutable assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**CSP gotchas**:

- `'unsafe-inline'` for styles is required by Tailwind CSS
- `frame-src *.ciamlogin.com` is required for MSAL silent token renewal (uses hidden iframe)
- `connect-src` must include your API domain and the CIAM token endpoint

## Docker — Multi-Stage Build

```dockerfile
# Build stage: Node
FROM node:24-slim AS build
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/*/package.json ...
RUN pnpm install --frozen-lockfile --ignore-scripts

ARG VITE_API_URL
ARG VITE_ENTRA_EXTERNAL_ID_TENANT
ARG VITE_ENTRA_EXTERNAL_ID_CLIENT_ID

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/portal packages/portal
RUN pnpm --filter @{{ORG_SCOPE}}/shared build
RUN pnpm --filter @{{ORG_SCOPE}}/portal build

# Runtime stage: Nginx
FROM nginx:alpine
COPY --from=build /app/packages/portal/dist /usr/share/nginx/html
COPY packages/portal/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

## Tailwind Design Tokens

```css
@theme {
  --color-mojo: #ff5a15; /* Brand orange */
  --color-mojo-dark: #e04d0f;
  --color-teal: #01b6a8; /* Primary action */
  --color-teal-dark: #019e92;
  --color-dark: #111111; /* Dark backgrounds */
}
```

Component patterns:

- **Cards**: `rounded-lg border border-gray-200 bg-white p-6 shadow-sm`
- **Buttons**: `rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark`
- **Tables**: `min-w-full divide-y divide-gray-200`
- **Forms**: `rounded border border-gray-300 px-3 py-2 text-sm`

## Dependencies

```json
{
  "react": "^19.1.0",
  "react-router-dom": "^7.5.0",
  "@azure/msal-browser": "^5.6.0",
  "@azure/msal-react": "^5.1.0",
  "tailwindcss": "^4.1.0",
  "vite": "^6.3.0"
}
```
