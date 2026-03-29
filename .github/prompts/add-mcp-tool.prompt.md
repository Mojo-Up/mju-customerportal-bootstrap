---
description: "Add a new MCP tool with Zod validation, audit logging, and proper authorisation checks."
agent: "mcp"
argument-hint: "Describe the tool (name, purpose, inputs, outputs)"
---

Add a new MCP tool following the established patterns:

1. Define the tool in `packages/mcp-server/src/index.ts` using `server.tool()`
2. Add Zod input validation schema
3. Implement business logic with Prisma queries
4. Add audit logging for mutating operations
5. Validate authorisation (session role check)
6. Run `pnpm --filter @{{ORG_SCOPE}}/mcp-server build` to verify

Tool: ${input:tool_description}
