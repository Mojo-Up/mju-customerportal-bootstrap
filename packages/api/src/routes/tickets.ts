import { Router, Request, Response } from 'express';
import { param } from '../lib/params.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import {
  createTicketSchema,
  createTicketMessageSchema,
  createTicketMessageWithInternalSchema,
  paginationSchema,
} from '@{{ORG_SCOPE}}/shared';

const router = Router();

router.use(authenticate);

/**
 * GET /api/organisations/:orgId/tickets — list tickets
 */
router.get('/:orgId/tickets', requireOrgRole(), async (req: Request, res: Response) => {
  const pagination = paginationSchema.safeParse(req.query);
  const { page, limit } = pagination.success ? pagination.data : { page: 1, limit: 20 };
  const skip = (page - 1) * limit;

  const [tickets, total] = await prisma.$transaction([
    prisma.supportTicket.findMany({
      where: { orgId: param(req, 'orgId') },
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supportTicket.count({ where: { orgId: param(req, 'orgId') } }),
  ]);

  res.json({
    data: tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      createdBy: t.user,
      messageCount: t._count.messages,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

/**
 * POST /api/organisations/:orgId/tickets — create ticket
 */
router.post('/:orgId/tickets', requireOrgRole(), async (req: Request, res: Response) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { subject, body, priority } = parsed.data;

  const ticket = await prisma.supportTicket.create({
    data: {
      orgId: param(req, 'orgId'),
      userId: req.user!.id,
      subject,
      priority: priority as 'low' | 'medium' | 'high',
      messages: {
        create: {
          userId: req.user!.id,
          body,
        },
      },
    },
    include: { messages: true },
  });

  res.status(201).json(ticket);
});

/**
 * GET /api/tickets/:ticketId — ticket detail with messages
 */
router.get('/tickets/:ticketId', async (req: Request, res: Response) => {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: param(req, 'ticketId') },
    select: { id: true, orgId: true },
  });

  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  // Verify membership unless staff
  if (!req.user!.isStaff) {
    const membership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: req.user!.id, orgId: ticket.orgId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const fullTicket = await prisma.supportTicket.findUnique({
    where: { id: ticket.id },
    include: {
      user: { select: { name: true, email: true } },
      messages: {
        where: req.user!.isStaff ? {} : { isInternal: false },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  res.json(fullTicket);
});

/**
 * POST /api/tickets/:ticketId/messages — add message to ticket
 */
router.post('/tickets/:ticketId/messages', async (req: Request, res: Response) => {
  const schema = req.user!.isStaff
    ? createTicketMessageWithInternalSchema
    : createTicketMessageSchema;
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: param(req, 'ticketId') },
  });
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }

  // Verify access
  if (!req.user!.isStaff) {
    const membership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: req.user!.id, orgId: ticket.orgId } },
    });
    if (!membership) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
  }

  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      userId: req.user!.id,
      body: parsed.data.body,
      isInternal:
        req.user!.isStaff &&
        ('isInternal' in parsed.data ? parsed.data.isInternal === true : false),
    },
    include: { user: { select: { name: true, email: true } } },
  });

  // Update ticket timestamp
  await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: { updatedAt: new Date() },
  });

  res.status(201).json(message);
});

export default router;
