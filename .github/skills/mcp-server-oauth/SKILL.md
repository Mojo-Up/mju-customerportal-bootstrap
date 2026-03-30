---
name: mcp-server-oauth
description: 'Build MCP servers with Entra ID OAuth authentication, StreamableHTTP transport, RFC 9728/8414/7591 metadata endpoints, JWKS token validation, session management, and rate limiting. The current server has 66 tools. Use when: creating MCP server, adding OAuth to MCP, debugging MCP auth, configuring Entra workforce tenant for MCP, setting up VS Code or Copilot Studio MCP client auth, adding new MCP tools.'
---

# MCP Server with Entra ID OAuth

Build production-ready MCP servers that authenticate via Microsoft Entra ID using the StreamableHTTP transport with OAuth 2.0. This skill captures hard-won lessons from multiple projects.

## When to Use

- Creating a new MCP server with authentication
- Adding OAuth to an existing MCP server
- Debugging token validation failures with Entra ID
- Configuring MCP clients (VS Code, Copilot Studio) to connect
- Implementing RFC 9728 protected resource metadata

## Architecture Overview

```
Client (VS Code / Copilot Studio)
  │
  ├─ GET /.well-known/oauth-protected-resource   → Discovers scopes + auth server
  ├─ GET /.well-known/oauth-authorization-server  → Gets Entra endpoints
  ├─ POST /oauth/register                         → Dynamic client registration (RFC 7591)
  │
  ├─ [OAuth flow with Entra ID directly]
  │
  ├─ POST /mcp  (Bearer token)  → JSON-RPC request
  ├─ GET  /mcp  (Bearer token)  → SSE stream for notifications
  └─ DELETE /mcp                 → Session teardown
```

## Critical Gotchas (Ranked by Pain)

### 1. Scope Format — `{clientId}/.default` NOT `api://{clientId}/.default`

This is the **#1 recurring issue**. When an MCP server requests a token for itself (the app is both the API and the resource), the scope must be:

```
{{ENTRA_WORKFORCE_CLIENT_ID}}/.default
```

NOT:

```
api://{{ENTRA_WORKFORCE_CLIENT_ID}}/.default
```

The `api://` prefix is only for when a _separate_ client app requests a token for a _different_ API. When your app exposes the resource itself, use the bare GUID. This applies to both the RFC 9728 metadata response and any client configuration.

### 2. Dual Issuer Validation (v1.0 and v2.0)

Entra tokens can have EITHER issuer format depending on the client app manifest's `accessTokenAcceptedVersion`:

```typescript
const VALID_ISSUERS = [
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`, // v2.0
  `https://sts.windows.net/${TENANT_ID}/`, // v1.0 (trailing slash!)
];
```

**Always accept both.** If you only validate v2.0, tokens from legacy apps or certain Copilot Studio configs will fail silently with "invalid issuer".

### 3. Dual Audience Validation

Same issue — tokens may have audience as `api://{clientId}` or just `{clientId}`:

```typescript
jwt.verify(token, signingKey, {
  issuer: VALID_ISSUERS,
  audience: [`api://${CLIENT_ID}`, CLIENT_ID], // Accept both
  algorithms: ['RS256'],
});
```

### 4. Email Claim Fallback Chain

Different Entra configurations put the email in different claims:

```typescript
const email = payload.preferred_username ?? payload.email ?? payload.upn ?? payload.emails?.[0];
```

`preferred_username` is most common for workforce tenants. External ID (CIAM) uses `emails[0]`. The `upn` field exists in some legacy configurations.

### 5. Object ID Claim — `oid` vs `sub`

For user lookup, prefer `oid` (globally unique across Entra) but fall back to `sub` (unique per-app):

```typescript
const entraObjectId = payload.oid ?? payload.sub;
```

### 6. JWKS Client Caching

Always configure caching to avoid rate-limiting by the Entra JWKS endpoint:

```typescript
const jwksClient = jwksRsa({
  jwksUri: `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000, // 10 minutes
});
```

### 7. Copilot Studio Requires Public Client Flows

In the Entra app registration, you MUST enable **"Allow public client flows"** for Copilot Studio to work. It uses OAuth 2.0 with PKCE as a public client.

### 8. Dynamic Client Registration — Return Fixed Client ID with Scopes

RFC 7591 expects a registration endpoint, but Entra doesn't support dynamic registration. Return your pre-registered client ID along with scopes. The `scope` field in the response is critical — VS Code and Copilot Studio use it to build the authorization request:

```typescript
// POST /oauth/register
const body = JSON.parse(await readBody(req));
res.json({
  client_id: ENTRA_CLIENT_ID,
  client_name: '{{PROJECT_NAME}} MCP Client',
  redirect_uris: Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u: string) => typeof u === 'string' && URL.canParse(u))
    : [],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none', // Public client
  scope: `${ENTRA_CLIENT_ID}/.default openid offline_access`,  // Critical for clients
});
```

**Important:** The `scope` field tells clients which scopes to request during authorization. Without it, clients may request incorrect scopes and receive tokens the MCP server rejects.

### 9. Application ID URI — Custom URL, Not `api://`

The Application ID URI must be set to the MCP server URL (not the default `api://` format). This is required because VS Code's MCP client sends an RFC 8707 `resource` parameter matching this URI:

```
Application ID URI: https://customerportalmcp.{{DOMAIN}}/mcp
```

This is configured in Entra under **Expose an API** → **Application ID URI**. It must match the URL the client uses to reach the MCP endpoint.

### 10. Implicit Grant Settings — Enable Both Token Types

In the Entra app registration under **Authentication** → **Implicit grant and hybrid flows**, enable BOTH:
- **Access tokens** (for clients that need implicit flow fallback)
- **ID tokens** (for OIDC-based clients)

These are required for certain Copilot Studio connector configurations.

## Required OAuth Metadata Endpoints

### RFC 9728 — Protected Resource Metadata (Returns 404!)

The PRM endpoint **intentionally returns 404**. This is the critical workaround for Entra v2.0 `AADSTS9010010`:

```typescript
// GET /.well-known/oauth-protected-resource → 404
if (url.startsWith('/.well-known/oauth-protected-resource') && req.method === 'GET') {
  res.writeHead(404);
  res.end();
  return;
}
```

**Why 404?** When PRM exists with a `resource` value, the MCP SDK sends an RFC 8707 `resource` parameter to the Entra authorize endpoint. Entra v2.0 rejects requests that include BOTH a `resource` parameter AND scopes (`AADSTS9010010: resource param must match Application ID URI; scope must not conflict`). By returning 404, the SDK skips the `resource` parameter entirely and discovers auth via the authorization server metadata / DCR instead.

> **Do NOT change this to return metadata.** It will break VS Code and Copilot Studio OAuth flows.

### RFC 8414 — Authorization Server Metadata

```typescript
// GET /.well-known/oauth-authorization-server
{
  issuer: MCP_SERVER_URL,  // NOT the Entra issuer — this is the MCP server itself
  authorization_endpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
  token_endpoint: `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  registration_endpoint: `${MCP_SERVER_URL}/oauth/register`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  token_endpoint_auth_methods_supported: ['none'],  // Public client
  code_challenge_methods_supported: ['S256'],
  scopes_supported: [`${CLIENT_ID}/.default`, 'openid', 'offline_access'],
}
```

**Note:** The `issuer` field is set to `MCP_SERVER_URL` (e.g. `https://customerportalmcp.{{DOMAIN}}`), NOT the Entra issuer. The MCP server acts as the authorization server proxy — clients discover it here and are directed to Entra for the actual OAuth flow.

## Session Management

### Key Parameters

```typescript
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes idle
const CLEANUP_INTERVAL_MS = 60_000; // Check every minute
```

### Session Lifecycle

1. **Create**: First POST to `/mcp` without `mcp-session-id` header
2. **Reuse**: Subsequent requests include `mcp-session-id` header
3. **Expire**: Idle > 30 minutes → auto-closed
4. **Delete**: Client sends DELETE → explicit teardown
5. **Capacity**: 503 if MAX_SESSIONS reached

### Critical: Session ID is Generated by Transport

The `StreamableHTTPServerTransport` generates its own session ID internally. You must wait for `handleRequest()` to complete before reading it:

```typescript
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
await server.connect(transport);
await transport.handleRequest(req, res); // ID generated here

// AFTER handleRequest:
const sessionId = transport.sessionId;
sessions.set(sessionId, { transport, server, lastActivity: Date.now() });
```

## Rate Limiting

In-memory per-IP rate limiting (not distributed):

```typescript
const RATE_LIMIT = 60; // requests per minute
const RATE_WINDOW_MS = 60_000; // 1 minute window

// Caveat: resets per-process. If running multiple instances behind
// a load balancer, each instance has separate counters.
```

Return 429 with `Retry-After` header when exceeded.

## Auth Middleware Pattern

```typescript
async function authenticateRequest(req: IncomingMessage): Promise<AuthResult> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return { error: 'Missing Bearer token' };
  }

  const token = auth.slice(7);
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || decoded.header.alg !== 'RS256') {
    return { error: 'Invalid token format' };
  }

  const signingKey = await jwksClient.getSigningKey(decoded.header.kid);
  const payload = jwt.verify(token, signingKey.getPublicKey(), {
    issuer: VALID_ISSUERS,
    audience: [`api://${CLIENT_ID}`, CLIENT_ID],
    algorithms: ['RS256'],
  });

  // Check app role
  const roles: string[] = payload.roles ?? [];
  if (!roles.includes('MCP.Admin')) {
    return { error: 'Missing MCP.Admin role' };
  }

  // Resolve user from DB
  const oid = payload.oid ?? payload.sub;
  const email = payload.preferred_username ?? payload.email ?? payload.upn;

  let user = await prisma.user.findFirst({ where: { entraObjectId: oid } });
  if (!user && email) {
    user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
  }

  if (!user?.isStaff) {
    return { error: 'Not authorized' };
  }

  return { user };
}
```

## 401 Response Format

Always include the `WWW-Authenticate` header pointing to the protected resource metadata (RFC 6750):

```typescript
res.writeHead(401, {
  'Content-Type': 'application/json',
  'WWW-Authenticate': `Bearer resource_metadata="${MCP_SERVER_URL}/.well-known/oauth-protected-resource"`,
});
```

This tells MCP clients where to discover auth configuration automatically.

## HTTP Server Configuration

```typescript
const server = createServer(handler);
server.timeout = 0; // MUST be 0 — SSE notification streams are long-lived
server.headersTimeout = 10_000; // 10s for headers
server.keepAliveTimeout = 5_000;
```

**Critical:** `timeout` MUST be `0` (disabled). The MCP protocol uses GET requests for SSE notification streams that stay open indefinitely. A 30s timeout kills these streams and breaks the session. Session TTL handles cleanup instead.

## Tool Registration Pattern

```typescript
server.tool(
  'tool_name',
  'Human-readable description for the AI model',
  {
    param1: z.string().describe('What this parameter is for'),
    param2: z.number().optional().describe('Optional with default behavior'),
  },
  async ({ param1, param2 }) => {
    try {
      // Business logic
      audit('tool_name', { param1, param2 });
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
    }
  },
);
```

## Environment Variables

Required:

- `ENTRA_WORKFORCE_TENANT_ID` — Entra tenant GUID
- `ENTRA_WORKFORCE_CLIENT_ID` — App registration client ID
- `MCP_SERVER_URL` — Public URL (for metadata endpoints)
- `ACTIVATION_HMAC_KEY` — (if generating activation codes)
- `DATABASE_URL` — Prisma connection string

Optional:

- `MCP_PORT` — Default 3002

Validate all required vars at startup and exit immediately if missing:

```typescript
const required = ['ENTRA_WORKFORCE_TENANT_ID', 'ENTRA_WORKFORCE_CLIENT_ID', 'MCP_SERVER_URL'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}
```

## Graceful Shutdown

```typescript
async function shutdown(signal: string) {
  console.log(`${signal} received, closing ${sessions.size} sessions...`);
  for (const [id, session] of sessions) {
    await session.transport.close();
    await session.server.close();
    sessions.delete(id);
  }
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

## Entra App Registration Configuration

Verified configuration from the production app registration (`{{ENTRA_WORKFORCE_CLIENT_ID}}`):

### 1. Basic Settings

| Setting | Value |
|---------|-------|
| **Display name** | {{PROJECT_NAME}} Customer Portal External ID Integration |
| **Supported account types** | Single tenant (`AzureADMyOrg`) |
| **Application ID URI** | `https://customerportalmcp.{{DOMAIN}}/mcp` |

### 2. Authentication — Redirect URIs

**Web platform** (for GitHub Copilot / VS Code):
- `https://github.com/login/oauth/authorize`

**Public client / native** (for Copilot Studio and CLI):
- `http://127.0.0.1` (local callback for VS Code desktop)
- `https://global.consent.azure-apim.net/redirect/{connector-id}` (Copilot Studio connector)

**Implicit grant and hybrid flows** — enable BOTH:
- [x] Access tokens
- [x] ID tokens

**Allow public client flows** — YES (required for PKCE-based clients like Copilot Studio)

### 3. App Roles

| Value | Display Name | Allowed Member Types | Description |
|-------|-------------|---------------------|-------------|
| `MCP.Admin` | MCP Access Allow | User | Members will be allowed to authenticate to MCP Endpoint |

Assign users to this role via **Enterprise Applications** → **Users and groups**.

### 4. Expose an API

| Scope | Type | Admin Consent Description |
|-------|------|---------------------------|
| `access` | User | Allows access to the {{PROJECT_NAME}} MCP server |

The `.default` scope is used by clients (not the `access` scope directly). The `access` scope exists for explicit consent scenarios.

### 5. API Permissions

| API | Permission | Type |
|-----|-----------|------|
| Microsoft Graph | `User.Read` | Delegated |

### 6. Service Principal

| Setting | Value |
|---------|-------|
| `appRoleAssignmentRequired` | `false` (any authenticated workforce user can attempt, MCP.Admin role is checked in code) |

### Setup Checklist (New Deployment)

1. Create app registration in workforce tenant (`AzureADMyOrg`)
2. Set **Application ID URI** to `{MCP_SERVER_URL}/mcp` (NOT `api://`)
3. Create **App Role**: `MCP.Admin` (User type, assigned to users/groups)
4. Enable **"Allow public client flows"** (for Copilot Studio and VS Code PKCE)
5. Add **Web redirect URI**: `https://github.com/login/oauth/authorize`
6. Add **Public client redirect URI**: `http://127.0.0.1`
7. Enable **Implicit grant**: both Access tokens and ID tokens
8. **Expose an API** → Add `access` scope
9. Under **API permissions**, grant `User.Read` for Microsoft Graph
10. Assign users to `MCP.Admin` role via Enterprise Applications
11. If using Copilot Studio, add its connector redirect URI to public client URIs

## Dependencies

```json
{
  "@modelcontextprotocol/sdk": "^1.12.0",
  "jsonwebtoken": "^9.0.3",
  "jwks-rsa": "^3.2.2",
  "zod": "^3.24.0"
}
```

Use raw `node:http` server (not Express) — the MCP SDK's `StreamableHTTPServerTransport` expects `IncomingMessage`/`ServerResponse` directly.

## Docker Build

The MCP server shares Prisma schema with the API. Copy and generate Prisma client in the build stage:

```dockerfile
COPY packages/api/prisma packages/api/prisma
RUN cd packages/api && npx prisma generate
```

Run as non-root user in production:

```dockerfile
RUN groupadd -r mcpuser && useradd -r -g mcpuser -d /app mcpuser
USER mcpuser
```

## Client-Specific Configuration

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json` or user MCP settings:

```json
{
  "servers": {
    "{{PROJECT_NAME_LOWER}}": {
      "url": "https://customerportalmcp.{{DOMAIN}}/mcp"
    }
  }
}
```

VS Code automatically discovers OAuth via:
1. Attempts `GET /.well-known/oauth-protected-resource` → gets 404 (skips `resource` param)
2. Falls back to `GET /.well-known/oauth-authorization-server` → gets Entra endpoints + scopes
3. Calls `POST /oauth/register` → gets client ID + scopes
4. Opens browser for Entra authorization code flow with PKCE
5. Uses `http://127.0.0.1` callback to receive the auth code

### Copilot Studio

Create a custom connector with **Manual OAuth 2.0** configuration:

| Setting | Value |
|---------|-------|
| Auth type | OAuth 2.0 Manual |
| Authorization URL | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize` |
| Token URL | `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` |
| Client ID | `{clientId}` (from DCR or pre-registered) |
| Scope | `{clientId}/.default openid offline_access` |
| Enable PKCE | Yes |

Requires:
- **"Allow public client flows"** enabled in app registration
- Copilot Studio connector redirect URI added to **Public client** redirect URIs
- `MCP.Admin` role assigned to the Copilot Studio service account

### Debugging Auth Failures

| Error | Cause | Fix |
|-------|-------|-----|
| `AADSTS9010010` | PRM returns metadata → SDK sends `resource` param | Ensure PRM returns 404 |
| `AADSTS65001` | User hasn't consented | Grant admin consent or have user consent |
| `AADSTS700016` | Client ID mismatch | Verify `client_id` in DCR matches app registration |
| `AADSTS50011` | Redirect URI mismatch | Add exact URI to correct platform (web vs public client) |
| `invalid issuer` | Token from v1 endpoint | Accept both v1 (`sts.windows.net`) and v2 issuers |
| `invalid audience` | Token has `api://` prefix | Accept both `api://{id}` and bare `{id}` |
| `Missing MCP.Admin role` | User not assigned role | Assign via Enterprise Apps → Users and groups |
| `staff access required` | User lacks `isStaff` flag | Set `isStaff: true` in database |
| SSE stream disconnects | `httpServer.timeout` not 0 | Set `httpServer.timeout = 0` |

## Testing Checklist

- [ ] Token with `api://` audience works
- [ ] Token with bare GUID audience works
- [ ] Token with v1.0 issuer (`sts.windows.net`) works
- [ ] Token with v2.0 issuer (`login.microsoftonline.com`) works
- [ ] Missing Bearer token returns 401 with `WWW-Authenticate` header
- [ ] Expired token returns 401
- [ ] User without `MCP.Admin` role gets rejected
- [ ] User with role but `isStaff=false` gets rejected
- [ ] `/.well-known/oauth-protected-resource` returns **404** (not metadata)
- [ ] `/.well-known/oauth-authorization-server` returns Entra endpoints with `issuer: MCP_SERVER_URL`
- [ ] `POST /oauth/register` returns fixed client ID with `scope` field
- [ ] VS Code MCP client can authenticate and call tools end-to-end
- [ ] Copilot Studio can authenticate via PKCE flow end-to-end
- [ ] Session expires after 30 minutes idle
- [ ] MAX_SESSIONS limit returns 503
- [ ] Rate limiting returns 429 with Retry-After
