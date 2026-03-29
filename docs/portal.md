# Portal

## Overview

The portal (`packages/portal`) is a React single-page application built with Vite, TailwindCSS, and MSAL for authentication. It provides the customer-facing interface for managing organisations, subscriptions, licences, support tickets, and downloads, plus a staff admin panel.

**URL**: `https://portal.{{DOMAIN}}`

## Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19 | UI framework |
| React Router | 7 | Client-side routing |
| Vite | 6 | Build tool and dev server |
| TailwindCSS | 4 | Utility-first CSS |
| MSAL Browser | 5 | Entra External ID authentication |
| MSAL React | 5 | React auth bindings |
| TypeScript | 5.8 | Type safety |
| nginx | Alpine | Production static hosting |

## Architecture

```mermaid
graph TD
    subgraph Browser["Browser"]
        React[React SPA]
        MSAL[MSAL Library]
        Router[React Router]
        OrgCtx[OrgContext]
        ApiClient[API Client]
    end

    subgraph Auth["Entra External ID (CIAM)"]
        CIAM[ciamlogin.com]
    end

    subgraph Backend["Backend"]
        API[Express API]
        Stripe[Stripe Checkout]
    end

    React --> Router
    React --> OrgCtx
    React --> ApiClient
    React --> MSAL

    MSAL -->|Login redirect| CIAM
    CIAM -->|Token| MSAL
    MSAL -->|Access token| ApiClient

    ApiClient -->|Bearer token| API
    ApiClient -->|Checkout redirect| Stripe
    OrgCtx -->|Fetch orgs| ApiClient
```

## Authentication Flow

```mermaid
sequenceDiagram
    participant User as User
    participant Portal as Portal SPA
    participant MSAL as MSAL Library
    participant CIAM as Entra CIAM
    participant API as API Server

    User->>Portal: Visit portal.{{DOMAIN}}
    Portal->>Portal: Check MSAL accounts

    alt Not authenticated
        Portal->>Portal: Show Landing Page
        User->>Portal: Click "Sign In"
        Portal->>MSAL: loginRedirect()
        MSAL->>CIAM: Redirect to login
        CIAM->>User: Sign in / Sign up form
        User->>CIAM: Credentials
        CIAM->>Portal: Redirect with auth code
        MSAL->>MSAL: handleRedirectPromise()
        MSAL->>CIAM: Exchange code for tokens
        CIAM-->>MSAL: ID token + Access token
    end

    Portal->>MSAL: acquireTokenSilent()
    MSAL-->>Portal: Access token
    Portal->>API: GET /api/organisations (Bearer token)
    API-->>Portal: User's organisations

    alt No organisations
        Portal->>Portal: Show Onboarding
    else Has organisations
        Portal->>Portal: Show Dashboard
    end
```

## Application Structure

```mermaid
graph TD
    subgraph Entry["Entry Point"]
        Main["main.tsx<br/>MSAL init + render"]
    end

    subgraph App["App.tsx"]
        MsalProv["MsalProvider"]
        BRouter["BrowserRouter"]
        Routes["Routes"]
    end

    subgraph Layout["AppLayout"]
        Nav["Navigation Bar<br/>Logo, links, org switcher, sign out"]
        Outlet["Page Outlet"]
    end

    subgraph Public["Public Routes"]
        Landing["/ — LandingPage"]
        Pricing["/pricing — PricingPage"]
    end

    subgraph Protected["Protected Routes (auth required)"]
        Dashboard["/dashboard"]
        Products["/products"]
        ProductDetail["/products/:slug"]
        Licences["/licences"]
        Support["/support"]
        Downloads["/downloads"]
        Settings["/settings"]
        Billing["/billing"]
        Onboarding["/onboarding"]
        CheckoutSuccess["/checkout/success"]
        AcceptInvite["/accept-invite/:token"]
    end

    subgraph Admin["Admin Routes (staff only)"]
        AdminDash["/admin"]
        AdminProducts["/admin/products"]
        AdminOrgs["/admin/organisations"]
        AdminOrgDetail["/admin/organisations/:orgId"]
        AdminUsers["/admin/users"]
    end

    Main --> App
    App --> MsalProv --> BRouter --> Routes
    Routes --> Public
    Routes --> Layout
    Layout --> Nav
    Layout --> Outlet
    Outlet --> Protected
    Outlet --> Admin
```

## Routing

### Public Routes (no authentication)

| Path | Page | Description |
|------|------|-------------|
| `/` | `LandingPage` | Marketing landing page with sign-in CTA |
| `/pricing` | `PricingPage` | Product pricing plans (fetched from API) |

### Protected Routes (authentication required)

All protected routes are wrapped in `<ProtectedRoute>`, which uses MSAL's `<AuthenticatedTemplate>` / `<UnauthenticatedTemplate>`. Unauthenticated users are redirected to `/`.

| Path | Page | Description |
|------|------|-------------|
| `/dashboard` | `DashboardPage` | Organisation overview, stats, pending invitations |
| `/products` | `ProductsPage` | Browse product catalogue |
| `/products/:slug` | `ProductDetailPage` | Product details with subscribe action |
| `/licences` | `LicencesPage` | Manage licences, environments, activation codes |
| `/support` | `SupportPage` | Support tickets — create, view, reply |
| `/downloads` | `DownloadsPage` | Download files (solutions, Power BI, guides) |
| `/settings` | `OrgSettingsPage` | Organisation settings, members, invitations |
| `/billing` | `BillingPage` | Subscription overview, Stripe portal link |
| `/onboarding` | `OnboardingPage` | Create first organisation (shown when user has no orgs) |
| `/checkout/success` | `CheckoutSuccessPage` | Post-checkout confirmation |
| `/accept-invite/:token` | `AcceptInvitePage` | Accept organisation invitation via link |

### Admin Routes (staff only)

Admin routes are visible only when the current user has `isStaff = true` (checked via `GET /api/me`).

| Path | Page | Description |
|------|------|-------------|
| `/admin` | `AdminDashboardPage` | System-wide statistics |
| `/admin/products` | `AdminProductsPage` | Manage products and pricing plans |
| `/admin/organisations` | `AdminOrganisationsPage` | Search and manage organisations |
| `/admin/organisations/:orgId` | `AdminOrgDetailPage` | Full org detail (members, subs, licences) |
| `/admin/users` | `AdminUsersPage` | User management, toggle staff access |

## Key Components

### `useAuth` Hook

Wraps MSAL operations and exposes:

| Property/Method | Type | Description |
|----------------|------|-------------|
| `isAuthenticated` | `boolean` | Whether a user account exists |
| `user` | `{ name, email } \| null` | Current user info from ID token claims |
| `account` | `AccountInfo` | Raw MSAL account |
| `getAccessToken()` | `Promise<string>` | Acquire token silently (refreshes automatically) |
| `login()` | `void` | Redirect to Entra CIAM login |
| `logout()` | `void` | Redirect logout |

**Email claim resolution order**: `emails[0]` → `email` → `preferred_username` → `username`

### `OrgContext` Provider

Manages the current organisation context across the app.

```mermaid
stateDiagram-v2
    [*] --> Loading: Auth complete
    Loading --> NoOrgs: API returns empty
    Loading --> HasOrgs: API returns orgs
    NoOrgs --> HasOrgs: User creates org
    HasOrgs --> Active: Set current org

    state Active {
        [*] --> Selected: From sessionStorage or first org
        Selected --> Switched: User picks different org
        Switched --> Selected: Org set + saved to sessionStorage
    }
```

| Property/Method | Type | Description |
|----------------|------|-------------|
| `organisations` | `OrgInfo[]` | All organisations the user belongs to |
| `currentOrg` | `OrgInfo \| null` | Currently selected organisation |
| `setCurrentOrg(org)` | `void` | Switch org (persisted to `sessionStorage`) |
| `loading` | `boolean` | Whether orgs are being fetched |
| `refetch()` | `Promise<void>` | Re-fetch organisations from API |

### `useApi` Hook (API Client)

Provides an authenticated fetch wrapper that automatically attaches Bearer tokens.

```typescript
const { apiFetch } = useApi();

// GET request
const orgs = await apiFetch<OrgInfo[]>('/api/organisations');

// POST request
await apiFetch('/api/organisations', {
  method: 'POST',
  body: { name: 'New Org' },
});
```

Features:
- Automatic `Bearer` token via `getAccessToken()`
- JSON serialisation/deserialisation
- Error extraction from API response body
- `isSafeRedirectUrl()` helper for validating redirect URLs (HTTPS only, optional domain allowlist)

### `AppLayout`

The main layout for all authenticated pages:

- **Navigation bar**: Logo, page links, org switcher dropdown (when user has multiple orgs), email display, sign out
- **Admin link**: Visible only to staff users
- **Mobile responsive**: Hamburger menu for screens below `lg` breakpoint
- **Outlet**: Renders the matched child route

## Build & Deployment

### Development

```bash
# Start dev server with hot reload
cd packages/portal
pnpm dev
```

Vite dev server runs on `http://localhost:5173` with a proxy that forwards `/api` requests to `http://localhost:3001`.

### Production Build

```bash
pnpm --filter @{{ORG_SCOPE}}/portal build
```

Outputs static files to `packages/portal/dist/`.

### Docker Build

```mermaid
graph LR
    subgraph Stage1["Build Stage (node:24-slim)"]
        Install[pnpm install]
        BuildShared[Build @{{ORG_SCOPE}}/shared]
        BuildPortal[Build @{{ORG_SCOPE}}/portal<br/>with VITE_ build args]
    end

    subgraph Stage2["Production Stage (nginx:alpine)"]
        Copy[Copy dist/ to nginx html]
        Conf[Copy nginx.conf]
    end

    Stage1 --> Stage2
```

Build arguments injected at build time:

| Build Arg | Description |
|-----------|-------------|
| `VITE_API_URL` | API base URL (e.g. `https://api.{{DOMAIN}}`) |
| `VITE_ENTRA_EXTERNAL_ID_TENANT` | CIAM tenant subdomain |
| `VITE_ENTRA_EXTERNAL_ID_CLIENT_ID` | CIAM app client ID |

### nginx Configuration

Production static hosting with:

- **SPA fallback**: `try_files $uri $uri/ /index.html` — all routes fall through to React Router
- **Security headers**: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, HSTS (2 years), Permissions-Policy
- **CSP**: Restricts scripts to `self`, allows connections to `*.{{DOMAIN}}`, `*.ciamlogin.com`, `*.stripe.com`, frames only from `*.ciamlogin.com`
- **Static asset caching**: 1 year with `immutable` for JS, CSS, images, fonts

## Configuration

Environment variables (injected at build time via Vite):

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | No | API base URL (dev proxy handles this locally) |
| `VITE_ENTRA_EXTERNAL_ID_TENANT` | Yes | CIAM tenant subdomain (e.g. `{{ENTRA_CIAM_TENANT}}`) |
| `VITE_ENTRA_EXTERNAL_ID_CLIENT_ID` | Yes | Entra app registration client ID |

### MSAL Configuration

| Setting | Value |
|---------|-------|
| Authority | `https://{tenant}.ciamlogin.com/` |
| Known authorities | `{tenant}.ciamlogin.com` |
| Redirect URI | `window.location.origin` |
| Cache location | `sessionStorage` |
| Login scopes | `api://{clientId}/access` |

## Page Summary

### Customer Pages

```mermaid
graph TD
    Landing["Landing Page<br/>Marketing + Sign In"] -->|Sign In| Dashboard
    Dashboard["Dashboard<br/>Org stats, invitations"] --> Products
    Dashboard --> Licences
    Dashboard --> Support
    Dashboard --> Downloads

    Products["Products<br/>Browse catalogue"] --> ProductDetail["Product Detail<br/>Features + Subscribe"]
    ProductDetail -->|Subscribe| Checkout["Stripe Checkout"]
    Checkout --> Success["Checkout Success"]

    Licences["Licences<br/>Manage environments"] -->|Activate| ActivationCode["Generate Code"]
    Support["Support<br/>Tickets + Messages"] -->|New Ticket| CreateTicket["Create Ticket"]
    Downloads["Downloads<br/>Solutions, guides"] -->|Download| SAS["SAS URL redirect"]

    Dashboard --> Settings["Org Settings<br/>Members, invitations"]
    Dashboard --> Billing["Billing<br/>Subscription management"]
    Billing -->|Manage| StripePortal["Stripe Portal"]
```

### Admin Pages

```mermaid
graph TD
    AdminDash["Admin Dashboard<br/>System stats"] --> AdminProducts["Products<br/>CRUD + pricing plans"]
    AdminDash --> AdminOrgs["Organisations<br/>Search + manage"]
    AdminDash --> AdminUsers["Users<br/>Search + staff toggle"]
    AdminOrgs --> AdminOrgDetail["Org Detail<br/>Members, subs, licences, envs"]
```
