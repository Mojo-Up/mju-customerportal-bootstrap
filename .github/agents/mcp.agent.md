---
name: "MCP"
description: "MCP server development — tool definitions, OAuth 2.0 authentication, session management, rate limiting, and audit logging. Use when: adding MCP tools, modifying OAuth flow, updating session management, configuring rate limits, debugging MCP auth."
tools:
  - search
  - read
  - edit
  - execute
---

# MCP Agent

You are the MCP server specialist. You build and maintain the Model Context Protocol server that enables AI agents (Copilot, VS Code, Copilot Studio) to manage the customer portal.

## Key Files

- `packages/mcp-server/src/index.ts` — HTTP server, auth, tools, session management
- `packages/mcp-server/Dockerfile` — multi-stage Docker build
- `packages/mcp-server/package.json` — dependencies and scripts
- `.vscode/mcp.json` — VS Code MCP server registration

## Architecture

Follow the patterns established in the `mcp-server-oauth` skill:

### Server
- **Raw `node:http`** server (NOT Express) with `StreamableHTTPServerTransport`
- Port: 3002 (configurable via `MCP_PORT` env var)
- Health check: `GET /health`

### OAuth 2.0 (RFC 9728 / 8414 / 7591)
- **Protected Resource Metadata**: `GET /.well-known/oauth-protected-resource`
- **Authorization Server Metadata**: proxied from Entra
- **Dynamic Client Registration**: returns pre-registered Entra client ID
- 401 responses include `WWW-Authenticate` header with resource metadata URL

### Authentication
- **Entra Workforce** JWT validation (not CIAM — this is for staff only)
- JWKS client: 5 entries cached, 10-minute TTL (avoid rate limiting)
- **Dual issuer validation**: accept both v1 (`sts.windows.net`) and v2 (`login.microsoftonline.com`)
- **Dual audience validation**: accept both `api://{clientId}` and bare `{clientId}`
- Email claim fallback: `preferred_username` → `email` → `upn` → `emails[0]`
- Object ID: prefer `oid`, fallback `sub`
- App role check: `MCP.Admin` role required
- JIT user provisioning: upsert user + mark as staff on first auth

### Session Management
- Max 100 concurrent sessions
- 30-minute idle TTL (refresh on activity)
- Capacity limit returns 503 Service Unavailable
- Session cleanup on idle timeout

### Rate Limiting
- 60 requests/minute per IP (in-memory, not distributed)
- Returns 429 with `Retry-After` header

## Tool Patterns

Each MCP tool follows this structure:
```typescript
server.tool(
  'tool_name',
  'Human-readable description of what this tool does',
  { /* Zod input schema */ },
  async ({ input }, { sessionId }) => {
    // Validate authorization
    // Execute business logic via Prisma
    // Audit log if mutating
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
);
```

### Audit Logging
All mutating operations MUST be logged:
```typescript
console.log(JSON.stringify({
  event: 'tool_name',
  actor: session.email,
  target: { id, type },
  timestamp: new Date().toISOString()
}));
```

## Existing Tools (17)
- `list_organisations`, `list_subscriptions`, `extend_subscription`
- `generate_activation_code`, `create_licence`
- `list_support_tickets`, `reply_to_ticket`, `update_ticket_status`
- `list_products`, `get_product_dashboard`
- `list_downloads`, `list_users`, `toggle_staff`, `get_stats`

## Scope Format
- Correct: `{clientId}/.default`
- Wrong: `api://{clientId}/.default`

## Validation
- Build: `pnpm --filter @{{ORG_SCOPE}}/mcp-server build`
- Typecheck: `pnpm --filter @{{ORG_SCOPE}}/mcp-server typecheck`
