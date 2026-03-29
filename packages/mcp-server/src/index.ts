#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createHmac, randomUUID } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { LicenceType } from '@{{ORG_SCOPE}}/shared';

const prisma = new PrismaClient();

// ─── Required environment variables ─────────────────────────────────────────

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`FATAL: ${key} environment variable is required`);
    process.exit(1);
  }
  return value;
}

const ACTIVATION_HMAC_KEY = requireEnv('ACTIVATION_HMAC_KEY');
const ENTRA_WORKFORCE_TENANT_ID = requireEnv('ENTRA_WORKFORCE_TENANT_ID');
const ENTRA_WORKFORCE_CLIENT_ID = requireEnv('ENTRA_WORKFORCE_CLIENT_ID');
const MCP_SERVER_URL = requireEnv('MCP_SERVER_URL'); // e.g. https://mcp.{{DOMAIN}}

const ENTRA_ISSUER = `https://login.microsoftonline.com/${ENTRA_WORKFORCE_TENANT_ID}/v2.0`;
const ENTRA_JWKS_URI = `https://login.microsoftonline.com/${ENTRA_WORKFORCE_TENANT_ID}/discovery/v2.0/keys`;
const ENTRA_AUTH_ENDPOINT = `https://login.microsoftonline.com/${ENTRA_WORKFORCE_TENANT_ID}/oauth2/v2.0/authorize`;
const ENTRA_TOKEN_ENDPOINT = `https://login.microsoftonline.com/${ENTRA_WORKFORCE_TENANT_ID}/oauth2/v2.0/token`;

const RESOURCE_METADATA_URL = `${MCP_SERVER_URL}/.well-known/oauth-protected-resource`;

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB
const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT = 60; // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds
const HEADER_TIMEOUT_MS = 10_000; // 10 seconds

// ─── Rate limiting ──────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT;
}

// ─── Entra Workforce Tenant JWT auth (staff only) ───────────────────────────

const jwksClient = jwksRsa({
  jwksUri: ENTRA_JWKS_URI,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000,
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

function audit(tool: string, params: Record<string, unknown>) {
  console.log(JSON.stringify({ level: 'audit', ts: new Date().toISOString(), tool, params }));
}

async function authenticateRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const wwwAuth = `Bearer resource_metadata="${RESOURCE_METADATA_URL}"`;
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': wwwAuth,
    });
    res.end(JSON.stringify({ error: 'Missing or invalid authorization header' }));
    return false;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuth,
      });
      res.end(JSON.stringify({ error: 'Invalid token' }));
      return false;
    }

    const signingKey = await getSigningKey(decoded.header);
    const payload = jwt.verify(token, signingKey, {
      issuer: [
        `https://login.microsoftonline.com/${ENTRA_WORKFORCE_TENANT_ID}/v2.0`,
        `https://sts.windows.net/${ENTRA_WORKFORCE_TENANT_ID}/`,
      ],
      audience: [`api://${ENTRA_WORKFORCE_CLIENT_ID}`, ENTRA_WORKFORCE_CLIENT_ID],
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;

    // Check for MCP.Admin app role
    const roles = (payload.roles || []) as string[];
    if (!roles.includes('MCP.Admin')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: MCP.Admin role required' }));
      return false;
    }

    const email = (payload.preferred_username || payload.email || payload.upn || '') as string;
    const entraObjectId = payload.oid || payload.sub;

    if (!email) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
        'WWW-Authenticate': wwwAuth,
      });
      res.end(JSON.stringify({ error: 'Token missing required claims' }));
      return false;
    }

    // Look up user by entraObjectId first, fall back to email
    let user = await prisma.user.findUnique({ where: { entraObjectId: entraObjectId || '' } });
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    }
    if (!user || !user.isStaff) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: staff access required' }));
      return false;
    }

    audit('auth', { userId: user.id, email: user.email });
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Authentication failed';
    res.writeHead(401, {
      'Content-Type': 'application/json',
      'WWW-Authenticate': wwwAuth,
    });
    res.end(JSON.stringify({ error: message }));
    return false;
  }
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateActivationCode(params: {
  environmentCode: string;
  licenceType: number;
  subscriptionId?: string;
  endDate?: Date;
}): string {
  const fingerprint = params.environmentCode.replace(/-/g, '').toLowerCase();
  let payload: string;

  switch (params.licenceType) {
    case LicenceType.Subscription: {
      const endDateCopy = new Date(params.endDate!);
      endDateCopy.setUTCHours(23, 59, 59, 0);
      payload = `${fingerprint}|${params.licenceType}|${params.subscriptionId}|${endDateCopy.toISOString()}`;
      break;
    }
    case LicenceType.TimeLimited: {
      payload = `${fingerprint}|${params.licenceType}|${params.endDate!.toISOString()}`;
      break;
    }
    case LicenceType.Unlimited: {
      payload = `${fingerprint}|${params.licenceType}|unlimited`;
      break;
    }
    default:
      throw new Error(`Unsupported licence type: ${params.licenceType}`);
  }

  const payloadBytes = Buffer.from(payload, 'utf-8');
  const hmac = createHmac('sha256', ACTIVATION_HMAC_KEY);
  hmac.update(payloadBytes);
  const signature = hmac.digest();

  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signature)}`;
}

// ─── MCP Server factory ─────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const srv = new McpServer({
    name: '{{PROJECT_NAME}} Admin',
    version: '0.1.0',
  });
  registerTools(srv);
  return srv;
}

function toolError(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}


function jsonResource(uri: string, data: unknown) {
  return {
    type: 'resource' as const,
    resource: { uri, mimeType: 'application/json', text: JSON.stringify(data, null, 2) },
  };
}

function registerTools(server: McpServer): void {
  // ─── Tool: generate_activation_code ─────────────────────────────────────────

  server.tool(
    'generate_activation_code',
    'Generate a signed activation code for a {{PRODUCT_NAME}} environment',
    {
      environmentCode: z.string().describe('Environment code (e.g. A7A8-551B-4BA1-42AB)'),
      licenceType: z.enum(['subscription', 'time_limited', 'unlimited']).describe('Licence type'),
      subscriptionId: z
        .string()
        .optional()
        .describe('Subscription ID (required for subscription type)'),
      endDate: z
        .string()
        .optional()
        .describe('End date ISO string (required for subscription and time_limited)'),
      days: z
        .number()
        .optional()
        .describe('Days from now (alternative to endDate for time_limited)'),
    },
    async ({ environmentCode, licenceType, subscriptionId, endDate, days }) => {
      try {
        const typeMap: Record<string, number> = {
          subscription: LicenceType.Subscription,
          time_limited: LicenceType.TimeLimited,
          unlimited: LicenceType.Unlimited,
        };

        let computedEndDate: Date | undefined;
        if (licenceType === 'subscription' || licenceType === 'time_limited') {
          if (endDate) {
            computedEndDate = new Date(endDate);
          } else if (days) {
            computedEndDate = new Date();
            computedEndDate.setDate(computedEndDate.getDate() + days);
          } else {
            return toolError('endDate or days required for this licence type');
          }
        }

        if (licenceType === 'subscription' && !subscriptionId) {
          return toolError('subscriptionId required for subscription type');
        }

        const code = generateActivationCode({
          environmentCode,
          licenceType: typeMap[licenceType],
          subscriptionId,
          endDate: computedEndDate,
        });

        const result = { code, environmentCode, licenceType, endDate: computedEndDate?.toISOString(), subscriptionId };

        return {
          content: [
            {
              type: 'text' as const,
              text: `Activation Code:\n${code}\n\nEnvironment: ${environmentCode}\nType: ${licenceType}${computedEndDate ? `\nEnd Date: ${computedEndDate.toISOString()}` : ''}${subscriptionId ? `\nSubscription: ${subscriptionId}` : ''}`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://activation-codes/${environmentCode}`, result),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to generate activation code');
      }
    },
  );

  // ─── Tool: list_organisations ───────────────────────────────────────────────

  server.tool(
    'list_organisations',
    'List all organisations with optional search. Returns org IDs needed by other tools.',
    {
      search: z
        .string()
        .optional()
        .describe('Search by name or customer ID (e.g. CUST-0001)'),
      limit: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ search, limit }) => {
      try {
        const take = limit ?? 10;

        const custMatch = search?.match(/^CUST-?(\d+)$/i);
        const where = custMatch
          ? { customerId: parseInt(custMatch[1], 10) }
          : search
            ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }] }
            : {};

        const orgs = await prisma.organisation.findMany({
          where,
          include: { _count: { select: { memberships: true, subscriptions: true } } },
          orderBy: { createdAt: 'desc' as const },
          take,
        });

        const text = orgs
          .map(
            (o) =>
              `- ${o.name} | ID: ${o.id} | CUST-${String(o.customerId).padStart(4, '0')} | ${o._count.subscriptions} subs, ${o._count.memberships} members`,
          )
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No organisations found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://organisations', orgs),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list organisations');
      }
    },
  );

  // ─── Tool: get_organisation_detail ──────────────────────────────────────────

  server.tool(
    'get_organisation_detail',
    'Get full details for an organisation including members, subscriptions, licences, and environments. Accepts UUID, customer ID (e.g. CUST-0001), or organisation name.',
    {
      identifier: z
        .string()
        .describe('Organisation UUID, customer ID (e.g. CUST-0001), or exact name'),
    },
    async ({ identifier }) => {
      try {
        const isUuid =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
        const custMatch = identifier.match(/^CUST-?(\d+)$/i);

        const include = {
          memberships: {
            include: { user: { select: { id: true, email: true, name: true } } },
          },
          subscriptions: { include: { product: { select: { name: true } } } },
          licences: {
            include: {
              product: { select: { name: true } },
              environments: true,
            },
          },
        } as const;

        let org;
        if (isUuid) {
          org = await prisma.organisation.findUnique({ where: { id: identifier }, include });
        } else if (custMatch) {
          org = await prisma.organisation.findUnique({
            where: { customerId: parseInt(custMatch[1], 10) },
            include,
          });
        } else {
          org = await prisma.organisation.findFirst({
            where: { name: { equals: identifier, mode: 'insensitive' } },
            include,
          });
        }

        if (!org) {
          return toolError(`Organisation not found for: ${identifier}`);
        }

        const text = [
          `Organisation: ${org.name}`,
          `ID: ${org.id}`,
          `Customer ID: CUST-${String(org.customerId).padStart(4, '0')}`,
          `Stripe Customer: ${org.stripeCustomerId || 'None'}`,
          `Created: ${org.createdAt.toISOString()}`,
          '',
          `Members (${org.memberships.length}):`,
          ...org.memberships.map(
            (m) =>
              `  - ${m.user.name} (${m.user.email}) | role: ${m.role} | user ID: ${m.user.id}`,
          ),
          '',
          `Subscriptions (${org.subscriptions.length}):`,
          ...org.subscriptions.map(
            (s) =>
              `  - ${s.id} | ${s.product.name} | ${s.plan} | ${s.status} | ends ${s.endDate.toISOString().split('T')[0]}`,
          ),
          '',
          `Licences (${org.licences.length}):`,
          ...org.licences.map((l) => {
            const envs = l.environments
              .map((e) => `${e.environmentCode} (${e.name || 'unnamed'}, env ID: ${e.id})`)
              .join(', ');
            return `  - Licence ID: ${l.id} | ${l.product.name} | ${l.type} | ${l.environments.length}/${l.maxEnvironments} envs: ${envs || 'none'}`;
          }),
        ].join('\n');

        return {
          content: [
            { type: 'text' as const, text },
            jsonResource(`{{PROJECT_NAME_LOWER}}://organisations/${org.id}`, org),
          ],
        };
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Failed to get organisation detail',
        );
      }
    },
  );

  // ─── Tool: list_subscriptions ───────────────────────────────────────────────

  server.tool(
    'list_subscriptions',
    'List subscriptions with optional filters',
    {
      status: z
        .enum(['active', 'expired', 'cancelled', 'past_due'])
        .optional()
        .describe('Filter by status'),
      expiringWithinDays: z
        .number()
        .optional()
        .describe('Show active subscriptions expiring within N days'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ status, expiringWithinDays, limit }) => {
      try {
        const take = limit ?? 20;
        const where: Record<string, unknown> = {};
        if (status) where.status = status;
        if (expiringWithinDays) {
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() + expiringWithinDays);
          where.endDate = { lte: cutoff };
          where.status = 'active';
        }

        const subs = await prisma.subscription.findMany({
          where,
          include: {
            org: { select: { name: true } },
            product: { select: { name: true } },
          },
          orderBy: { endDate: 'asc' as const },
          take,
        });

        const text = subs
          .map(
            (s) =>
              `- ${s.id} | ${s.org.name} | ${s.product.name} | ${s.plan} | ${s.status} | ends ${s.endDate.toISOString().split('T')[0]}`,
          )
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No subscriptions found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://subscriptions', subs),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list subscriptions');
      }
    },
  );

  // ─── Tool: extend_subscription ──────────────────────────────────────────────

  server.tool(
    'extend_subscription',
    'Extend a subscription end date',
    {
      subscriptionId: z.string().describe('Subscription ID (e.g. SUB-xxxx)'),
      newEndDate: z.string().describe('New end date (ISO format, e.g. 2026-12-31)'),
    },
    async ({ subscriptionId, newEndDate }) => {
      try {
        const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
        if (!sub) {
          return toolError(`Subscription not found: ${subscriptionId}`);
        }

        const updated = await prisma.subscription.update({
          where: { id: subscriptionId },
          data: { endDate: new Date(newEndDate), status: 'active' },
        });

        audit('extend_subscription', {
          subscriptionId,
          newEndDate,
          previousEndDate: sub.endDate.toISOString(),
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Subscription ${subscriptionId} extended from ${sub.endDate.toISOString().split('T')[0]} to ${newEndDate}`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://subscriptions/${subscriptionId}`, updated),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to extend subscription');
      }
    },
  );

  // ─── Tool: get_stats ────────────────────────────────────────────────────────

  server.tool('get_stats', 'Get portal dashboard statistics', {}, async () => {
    try {
      const [orgCount, userCount, activeSubCount, totalSubCount, ticketCount, envCount] =
        await prisma.$transaction([
          prisma.organisation.count(),
          prisma.user.count(),
          prisma.subscription.count({ where: { status: 'active' } }),
          prisma.subscription.count(),
          prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
          prisma.environment.count(),
        ]);

      const stats = { orgCount, userCount, activeSubCount, totalSubCount, ticketCount, envCount };

      return {
        content: [
          {
            type: 'text' as const,
            text: [
              `{{PROJECT_NAME}} Portal Statistics`,
              `─────────────────────────`,
              `Organisations: ${orgCount}`,
              `Users: ${userCount}`,
              `Active Subscriptions: ${activeSubCount}`,
              `Total Subscriptions: ${totalSubCount}`,
              `Environments: ${envCount}`,
              `Open Support Tickets: ${ticketCount}`,
            ].join('\n'),
          },
          jsonResource('{{PROJECT_NAME_LOWER}}://stats', stats),
        ],
      };
    } catch (err) {
      return toolError(err instanceof Error ? err.message : 'Failed to get stats');
    }
  });

  // ─── Tool: list_support_tickets ─────────────────────────────────────────────

  server.tool(
    'list_support_tickets',
    'List support tickets with optional filters',
    {
      status: z
        .enum(['open', 'in_progress', 'resolved', 'closed'])
        .optional()
        .describe('Filter by ticket status'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ status, limit }) => {
      try {
        const take = limit ?? 20;
        const where = status
          ? { status: status as 'open' | 'in_progress' | 'resolved' | 'closed' }
          : {};

        const tickets = await prisma.supportTicket.findMany({
          where,
          include: {
            org: { select: { name: true } },
            product: { select: { name: true } },
            user: { select: { name: true, email: true } },
            _count: { select: { messages: true } },
          },
          orderBy: { updatedAt: 'desc' as const },
          take,
        });

        const text = tickets
          .map(
            (t) =>
              `- [${t.status}] ${t.subject} | ID: ${t.id} | ${t.org.name} | ${t.product?.name ?? 'N/A'} | ${t.user.email} | ${t._count.messages} msgs | ${t.updatedAt.toISOString().split('T')[0]}`,
          )
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No tickets found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://tickets', tickets),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list tickets');
      }
    },
  );

  // ─── Tool: get_ticket_detail ────────────────────────────────────────────────

  server.tool(
    'get_ticket_detail',
    'Get full details for a support ticket including all messages',
    {
      ticketId: z.string().describe('Ticket UUID (from list_support_tickets)'),
    },
    async ({ ticketId }) => {
      try {
        const ticket = await prisma.supportTicket.findUnique({
          where: { id: ticketId },
          include: {
            org: { select: { name: true } },
            product: { select: { name: true } },
            user: { select: { name: true, email: true } },
            messages: {
              include: { user: { select: { name: true, email: true } } },
              orderBy: { createdAt: 'asc' as const },
            },
          },
        });

        if (!ticket) {
          return toolError(`Ticket not found: ${ticketId}`);
        }

        const text = [
          `Ticket: ${ticket.subject}`,
          `ID: ${ticket.id}`,
          `Status: ${ticket.status} | Priority: ${ticket.priority}`,
          `Organisation: ${ticket.org.name}`,
          `Product: ${ticket.product?.name ?? 'N/A'}`,
          `Created by: ${ticket.user.name} (${ticket.user.email})`,
          `Created: ${ticket.createdAt.toISOString()} | Updated: ${ticket.updatedAt.toISOString()}`,
          '',
          `Messages (${ticket.messages.length}):`,
          ...ticket.messages.map(
            (m) =>
              `  [${m.createdAt.toISOString().split('T')[0]}] ${m.user.name}${m.isInternal ? ' (INTERNAL)' : ''}:\n    ${m.body}`,
          ),
        ].join('\n');

        return {
          content: [
            { type: 'text' as const, text },
            jsonResource(`{{PROJECT_NAME_LOWER}}://tickets/${ticket.id}`, ticket),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to get ticket detail');
      }
    },
  );

  // ─── Tool: reply_to_ticket ──────────────────────────────────────────────────

  server.tool(
    'reply_to_ticket',
    'Reply to a support ticket. Can send visible reply or internal staff note.',
    {
      ticketId: z.string().describe('Ticket UUID'),
      body: z.string().describe('Message body text'),
      isInternal: z
        .boolean()
        .optional()
        .describe('If true, message is an internal staff note (not visible to customer). Default false.'),
      staffUserId: z.string().describe('Staff user UUID (from get_organisation_detail or list_users)'),
    },
    async ({ ticketId, body, isInternal, staffUserId }) => {
      try {
        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          return toolError(`Ticket not found: ${ticketId}`);
        }

        const message = await prisma.ticketMessage.create({
          data: {
            ticketId,
            userId: staffUserId,
            body,
            isInternal: isInternal ?? false,
          },
        });

        // Update ticket status to in_progress if it was open
        if (ticket.status === 'open') {
          await prisma.supportTicket.update({
            where: { id: ticketId },
            data: { status: 'in_progress' },
          });
        }

        audit('reply_to_ticket', { ticketId, messageId: message.id, isInternal: isInternal ?? false });

        return {
          content: [
            {
              type: 'text' as const,
              text: `${isInternal ? 'Internal note' : 'Reply'} added to ticket ${ticketId} (message ID: ${message.id})`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://tickets/${ticketId}/messages/${message.id}`, message),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to reply to ticket');
      }
    },
  );

  // ─── Tool: update_ticket_status ─────────────────────────────────────────────

  server.tool(
    'update_ticket_status',
    'Update the status or priority of a support ticket',
    {
      ticketId: z.string().describe('Ticket UUID'),
      status: z
        .enum(['open', 'in_progress', 'resolved', 'closed'])
        .optional()
        .describe('New status'),
      priority: z.enum(['low', 'medium', 'high']).optional().describe('New priority'),
    },
    async ({ ticketId, status, priority }) => {
      try {
        if (!status && !priority) {
          return toolError('Provide at least one of status or priority');
        }

        const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
        if (!ticket) {
          return toolError(`Ticket not found: ${ticketId}`);
        }

        const data: Record<string, string> = {};
        if (status) data.status = status;
        if (priority) data.priority = priority;

        const updated = await prisma.supportTicket.update({
          where: { id: ticketId },
          data,
        });

        audit('update_ticket_status', { ticketId, ...data });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Ticket ${ticketId} updated${status ? ` — status: ${status}` : ''}${priority ? ` — priority: ${priority}` : ''}`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://tickets/${ticketId}`, updated),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to update ticket');
      }
    },
  );

  // ─── Tool: approve_environment_increase ─────────────────────────────────────

  server.tool(
    'approve_environment_increase',
    'Increase the maximum environment limit for a licence',
    {
      licenceId: z.string().describe('Licence UUID (from get_organisation_detail output)'),
      newLimit: z.number().min(1).max(50).describe('New maximum number of environments'),
    },
    async ({ licenceId, newLimit }) => {
      try {
        const licence = await prisma.licence.findUnique({ where: { id: licenceId } });
        if (!licence) {
          return toolError(`Licence not found: ${licenceId}`);
        }

        const updated = await prisma.licence.update({
          where: { id: licenceId },
          data: { maxEnvironments: newLimit },
        });

        audit('approve_environment_increase', {
          licenceId,
          previousLimit: licence.maxEnvironments,
          newLimit,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Licence ${licenceId} environment limit updated from ${licence.maxEnvironments} to ${newLimit}`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://licences/${licenceId}`, updated),
          ],
        };
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : 'Failed to update environment limit',
        );
      }
    },
  );

  // ─── Tool: list_products ────────────────────────────────────────────────────

  server.tool(
    'list_products',
    'List all products with pricing plans',
    {
      activeOnly: z.boolean().optional().describe('Only show active products (default true)'),
    },
    async ({ activeOnly }) => {
      try {
        const where = (activeOnly ?? true) ? { isActive: true } : {};

        const products = await prisma.product.findMany({
          where,
          include: { pricingPlans: { orderBy: { sortOrder: 'asc' as const } } },
          orderBy: { sortOrder: 'asc' as const },
        });

        const text = products
          .map((p) => {
            const plans = p.pricingPlans
              .map((pp) => `${pp.name} ($${(pp.price / 100).toFixed(2)}/${pp.interval})`)
              .join(', ');
            return `- ${p.name} | ID: ${p.id} | ${p.isActive ? 'active' : 'inactive'} | Plans: ${plans || 'none'}`;
          })
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No products found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://products', products),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list products');
      }
    },
  );

  // ─── Tool: get_product_dashboard ────────────────────────────────────────────

  server.tool(
    'get_product_dashboard',
    'Get dashboard stats for a specific product including subscriber count, licence count, and recent activity',
    {
      productId: z.string().describe('Product UUID (from list_products)'),
    },
    async ({ productId }) => {
      try {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
          return toolError(`Product not found: ${productId}`);
        }

        const [activeSubCount, totalSubCount, licenceCount, envCount, ticketCount, recentDownloads] =
          await prisma.$transaction([
            prisma.subscription.count({ where: { productId, status: 'active' } }),
            prisma.subscription.count({ where: { productId } }),
            prisma.licence.count({ where: { productId } }),
            prisma.environment.count({
              where: { licence: { productId } },
            }),
            prisma.supportTicket.count({
              where: { productId, status: { in: ['open', 'in_progress'] } },
            }),
            prisma.downloadLog.count({
              where: {
                file: { productId },
                downloadedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
              },
            }),
          ]);

        const stats = {
          product: product.name,
          activeSubscriptions: activeSubCount,
          totalSubscriptions: totalSubCount,
          licences: licenceCount,
          environments: envCount,
          openTickets: ticketCount,
          downloadsLast30Days: recentDownloads,
        };

        const text = [
          `Product Dashboard: ${product.name}`,
          `────────────────────────────────`,
          `Active Subscriptions: ${activeSubCount}`,
          `Total Subscriptions: ${totalSubCount}`,
          `Licences: ${licenceCount}`,
          `Environments: ${envCount}`,
          `Open Tickets: ${ticketCount}`,
          `Downloads (last 30 days): ${recentDownloads}`,
        ].join('\n');

        return {
          content: [
            { type: 'text' as const, text },
            jsonResource(`{{PROJECT_NAME_LOWER}}://products/${productId}/dashboard`, stats),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to get product dashboard');
      }
    },
  );

  // ─── Tool: list_users ───────────────────────────────────────────────────────

  server.tool(
    'list_users',
    'List all users with optional search and staff filter',
    {
      search: z.string().optional().describe('Search by name or email'),
      staffOnly: z.boolean().optional().describe('Only show staff users'),
      limit: z.number().optional().describe('Max results (default 20)'),
    },
    async ({ search, staffOnly, limit }) => {
      try {
        const take = limit ?? 20;
        const where: Record<string, unknown> = {};
        if (staffOnly) where.isStaff = true;
        if (search) {
          where.OR = [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ];
        }

        const users = await prisma.user.findMany({
          where,
          include: {
            memberships: {
              include: { org: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: 'desc' as const },
          take,
        });

        const text = users
          .map((u) => {
            const orgs = u.memberships.map((m) => `${m.org.name} (${m.role})`).join(', ');
            return `- ${u.name} | ${u.email} | ID: ${u.id} | ${u.isStaff ? 'STAFF' : 'user'} | orgs: ${orgs || 'none'}`;
          })
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No users found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://users', users),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list users');
      }
    },
  );

  // ─── Tool: toggle_staff ─────────────────────────────────────────────────────

  server.tool(
    'toggle_staff',
    'Toggle staff status for a user (grant or revoke admin access)',
    {
      userId: z.string().describe('User UUID'),
      isStaff: z.boolean().describe('Set to true to grant staff access, false to revoke'),
    },
    async ({ userId, isStaff }) => {
      try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
          return toolError(`User not found: ${userId}`);
        }

        const updated = await prisma.user.update({
          where: { id: userId },
          data: { isStaff },
        });

        audit('toggle_staff', { userId, email: user.email, isStaff, previousIsStaff: user.isStaff });

        return {
          content: [
            {
              type: 'text' as const,
              text: `User ${user.name} (${user.email}) staff status: ${user.isStaff} → ${isStaff}`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://users/${userId}`, updated),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to toggle staff status');
      }
    },
  );

  // ─── Tool: create_licence ───────────────────────────────────────────────────

  server.tool(
    'create_licence',
    'Create a new licence for an organisation',
    {
      orgId: z.string().describe('Organisation UUID'),
      productId: z.string().describe('Product UUID'),
      type: z.enum(['subscription', 'time_limited', 'unlimited']).describe('Licence type'),
      subscriptionId: z.string().optional().describe('Subscription ID (for subscription type)'),
      expiryDate: z.string().optional().describe('Expiry date ISO string (for time_limited type)'),
      maxEnvironments: z.number().optional().describe('Max environments (default 5)'),
    },
    async ({ orgId, productId, type, subscriptionId, expiryDate, maxEnvironments }) => {
      try {
        const org = await prisma.organisation.findUnique({ where: { id: orgId } });
        if (!org) return toolError(`Organisation not found: ${orgId}`);

        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) return toolError(`Product not found: ${productId}`);

        if (type === 'subscription' && !subscriptionId) {
          return toolError('subscriptionId required for subscription type');
        }
        if (type === 'time_limited' && !expiryDate) {
          return toolError('expiryDate required for time_limited type');
        }

        const licence = await prisma.licence.create({
          data: {
            orgId,
            productId,
            type,
            subscriptionId: subscriptionId ?? null,
            expiryDate: expiryDate ? new Date(expiryDate) : null,
            maxEnvironments: maxEnvironments ?? 5,
          },
        });

        audit('create_licence', { licenceId: licence.id, orgId, productId, type });

        return {
          content: [
            {
              type: 'text' as const,
              text: `Licence created: ${licence.id} | ${product.name} | ${type} | ${org.name} | max ${licence.maxEnvironments} envs`,
            },
            jsonResource(`{{PROJECT_NAME_LOWER}}://licences/${licence.id}`, licence),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to create licence');
      }
    },
  );

  // ─── Tool: list_downloads ───────────────────────────────────────────────────

  server.tool(
    'list_downloads',
    'List available file downloads, optionally filtered by product',
    {
      productId: z.string().optional().describe('Filter by product UUID'),
    },
    async ({ productId }) => {
      try {
        const where = productId ? { productId } : {};

        const files = await prisma.fileDownload.findMany({
          where,
          include: { product: { select: { name: true } } },
          orderBy: { updatedAt: 'desc' as const },
        });

        const text = files
          .map(
            (f) =>
              `- ${f.name} | ${f.product.name} | ${f.category} | v${f.version} | ${(Number(f.fileSize) / 1024 / 1024).toFixed(1)} MB | ID: ${f.id}`,
          )
          .join('\n');

        return {
          content: [
            { type: 'text' as const, text: text || 'No downloads found' },
            jsonResource('{{PROJECT_NAME_LOWER}}://downloads', files),
          ],
        };
      } catch (err) {
        return toolError(err instanceof Error ? err.message : 'Failed to list downloads');
      }
    },
  );
} // end registerTools

// ─── Session tracking ───────────────────────────────────────────────────────

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastActivity: number;
}

const sessions = new Map<string, Session>();

// ─── Start Server ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error('body_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function main() {
  const httpServer = createServer(async (req, res) => {
    const url = req.url || '';

    // Rate limiting
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '60' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }

    try {
      // Health check
      if (url === '/health' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      // OAuth Protected Resource Metadata (RFC 9728)
      // Clients may request /.well-known/oauth-protected-resource or
      // /.well-known/oauth-protected-resource/mcp (with path suffix per RFC 9728)
      if (url.startsWith('/.well-known/oauth-protected-resource') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            resource: `${MCP_SERVER_URL}/mcp`,
            authorization_servers: [MCP_SERVER_URL],
            scopes_supported: [`${ENTRA_WORKFORCE_CLIENT_ID}/.default`],
            bearer_methods_supported: ['header'],
          }),
        );
        return;
      }

      // OAuth Authorization Server Metadata (RFC 8414)
      if (url.startsWith('/.well-known/oauth-authorization-server') && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer: MCP_SERVER_URL,
            authorization_endpoint: ENTRA_AUTH_ENDPOINT,
            token_endpoint: ENTRA_TOKEN_ENDPOINT,
            registration_endpoint: `${MCP_SERVER_URL}/oauth/register`,
            response_types_supported: ['code'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            token_endpoint_auth_methods_supported: ['none'],
            code_challenge_methods_supported: ['S256'],
            scopes_supported: [`${ENTRA_WORKFORCE_CLIENT_ID}/.default`, 'openid', 'offline_access'],
          }),
        );
        return;
      }

      // Dynamic Client Registration (RFC 7591) — returns the pre-registered Entra client_id
      if (url === '/oauth/register' && req.method === 'POST') {
        let body: Record<string, unknown>;
        try {
          body = JSON.parse((await readBody(req)).toString());
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client_metadata' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            client_id: ENTRA_WORKFORCE_CLIENT_ID,
            client_name: '{{PROJECT_NAME}} MCP Client',
            redirect_uris: Array.isArray(body.redirect_uris)
              ? (body.redirect_uris as unknown[]).filter(
                  (u): u is string => typeof u === 'string' && URL.canParse(u),
                )
              : [],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            token_endpoint_auth_method: 'none',
            scope: `${ENTRA_WORKFORCE_CLIENT_ID}/.default openid offline_access`,
          }),
        );
        return;
      }

      // MCP endpoint
      if (url === '/mcp' || url === '/') {
        if (!(await authenticateRequest(req, res))) return;

        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.method === 'POST') {
          let body: unknown;
          try {
            const raw = await readBody(req);
            body = JSON.parse(raw.toString());
          } catch (e) {
            if (e instanceof Error && e.message === 'body_too_large') {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Request body too large' }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
            return;
          }

          // Route to existing session
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            session.lastActivity = Date.now();
            await session.transport.handleRequest(req, res, body);
            return;
          }

          // Reject if at session capacity
          if (sessions.size >= MAX_SESSIONS) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many active sessions, try again later' }));
            return;
          }

          // New session (no session ID or stale/unknown session ID after redeploy)
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });
          const mcpServer = createMcpServer();
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, body);

          // Store session AFTER handleRequest so the transport has generated its ID
          const newSessionId = transport.sessionId;
          if (newSessionId) {
            sessions.set(newSessionId, { transport, server: mcpServer, lastActivity: Date.now() });
            console.log(`Session ${newSessionId} created (total: ${sessions.size})`);
            transport.onclose = () => {
              sessions.delete(newSessionId);
              console.log(`Session ${newSessionId} closed (total: ${sessions.size})`);
            };
          }
        } else if (req.method === 'GET') {
          // SSE stream for notifications — requires valid session
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            session.lastActivity = Date.now();
            await session.transport.handleRequest(req, res);
          } else {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or missing session for GET' }));
          }
        } else if (req.method === 'DELETE') {
          // Session teardown
          if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId)!;
            await session.transport.handleRequest(req, res);
            sessions.delete(sessionId);
          } else {
            res.writeHead(204);
            res.end();
          }
        } else {
          res.writeHead(405);
          res.end('Method not allowed');
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (err) {
      console.error('Unhandled request error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    }
  });

  httpServer.timeout = REQUEST_TIMEOUT_MS;
  httpServer.headersTimeout = HEADER_TIMEOUT_MS;
  httpServer.keepAliveTimeout = 5_000;

  // Expire idle sessions periodically
  const sessionCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastActivity > SESSION_TTL_MS) {
        s.transport.close?.();
        sessions.delete(id);
        console.log(`Session ${id} expired (total: ${sessions.size})`);
      }
    }
  }, 60_000);
  sessionCleanupInterval.unref();

  // Clean up stale rate-limit entries periodically
  const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
  }, 5 * 60_000);
  rateLimitCleanupInterval.unref();

  httpServer.listen(PORT, () => {
    console.log(`{{PROJECT_NAME}} MCP Server running on port ${PORT}`);
    console.log(`  Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`  Health: http://localhost:${PORT}/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`${signal} received — shutting down`);
    clearInterval(sessionCleanupInterval);
    clearInterval(rateLimitCleanupInterval);

    // Close all MCP sessions
    for (const [id, s] of sessions) {
      s.transport.close?.();
      sessions.delete(id);
    }

    // Stop accepting new connections and wait for in-flight requests
    httpServer.close(() => {
      console.log('HTTP server closed');
    });

    // Disconnect Prisma
    await prisma.$disconnect();
    console.log('Prisma disconnected');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
