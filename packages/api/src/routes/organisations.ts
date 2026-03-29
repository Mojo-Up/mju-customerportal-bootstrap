import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { param } from '../lib/params.js';
import {
  createOrgSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from '@{{ORG_SCOPE}}/shared';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/organisations — list user's organisations
 */
router.get('/', async (req: Request, res: Response) => {
  const memberships = await prisma.orgMembership.findMany({
    where: { userId: req.user!.id },
    include: { org: true },
  });

  res.json(
    memberships.map((m) => ({
      id: m.org.id,
      customerId: `CUST-${String(m.org.customerId).padStart(4, '0')}`,
      name: m.org.name,
      role: m.role,
      createdAt: m.org.createdAt,
    })),
  );
});

/**
 * POST /api/organisations — create a new organisation
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name } = parsed.data;

  const org = await prisma.organisation.create({
    data: {
      name,
      memberships: {
        create: {
          userId: req.user!.id,
          role: 'owner',
          acceptedAt: new Date(),
        },
      },
    },
  });

  res.status(201).json({
    id: org.id,
    customerId: `CUST-${String(org.customerId).padStart(4, '0')}`,
    name: org.name,
  });
});

/**
 * GET /api/organisations/:orgId — organisation detail
 */
router.get('/:orgId', requireOrgRole(), async (req: Request, res: Response) => {
  const org = await prisma.organisation.findUnique({
    where: { id: param(req, 'orgId') },
    include: {
      _count: {
        select: { memberships: true, subscriptions: true, licences: true, tickets: true },
      },
    },
  });

  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  res.json({
    id: org.id,
    customerId: `CUST-${String(org.customerId).padStart(4, '0')}`,
    name: org.name,
    role: req.orgContext!.role,
    stats: org._count,
    createdAt: org.createdAt,
  });
});

/**
 * PATCH /api/organisations/:orgId — update organisation (owner only)
 */
router.patch('/:orgId', requireOrgRole('owner'), async (req: Request, res: Response) => {
  const parsed = updateOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const org = await prisma.organisation.update({
    where: { id: param(req, 'orgId') },
    data: { name: parsed.data.name },
  });

  res.json({
    id: org.id,
    customerId: `CUST-${String(org.customerId).padStart(4, '0')}`,
    name: org.name,
  });
});

/**
 * DELETE /api/organisations/:orgId — delete organisation and all data (owner only)
 * Requires all subscriptions to be cancelled first.
 */
router.delete('/:orgId', requireOrgRole('owner'), async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    include: { subscriptions: { where: { status: { in: ['active', 'past_due'] } } } },
  });

  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  // Block deletion if there are active or past_due subscriptions
  if (org.subscriptions.length > 0) {
    res.status(400).json({
      error: `Cannot delete organisation with ${org.subscriptions.length} active subscription(s). Cancel all subscriptions first via the Manage Subscription button on the Licences page.`,
    });
    return;
  }

  // Cascade delete handles memberships, invitations, subscriptions, licences, environments, tickets, download logs
  await prisma.organisation.delete({ where: { id: orgId } });

  res.json({ message: 'Organisation and all associated data deleted' });
});

/**
 * GET /api/organisations/:orgId/members — list members
 */
router.get('/:orgId/members', requireOrgRole(), async (req: Request, res: Response) => {
  const members = await prisma.orgMembership.findMany({
    where: { orgId: param(req, 'orgId') },
    include: { user: { select: { id: true, email: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  res.json(
    members.map((m) => ({
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      acceptedAt: m.acceptedAt,
      createdAt: m.createdAt,
    })),
  );
});

/**
 * GET /api/organisations/:orgId/invitations — list pending invitations for an org
 */
router.get(
  '/:orgId/invitations',
  requireOrgRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const invitations = await prisma.orgInvitation.findMany({
      where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        expiresAt: i.expiresAt,
        createdAt: i.createdAt,
      })),
    );
  },
);

/**
 * POST /api/organisations/:orgId/invitations — invite a member
 */
router.post(
  '/:orgId/invitations',
  requireOrgRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { email, role } = parsed.data;
    const orgId = param(req, 'orgId');

    // Check if already a member
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      const existingMembership = await prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: existingUser.id, orgId } },
      });
      if (existingMembership) {
        res.status(409).json({ error: 'User is already a member of this organisation' });
        return;
      }
    }

    // Check for existing pending invitation
    const existingInvite = await prisma.orgInvitation.findFirst({
      where: { orgId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existingInvite) {
      res.status(409).json({ error: 'An invitation for this email is already pending' });
      return;
    }

    const invitation = await prisma.orgInvitation.create({
      data: {
        orgId,
        email,
        role: role as 'admin' | 'billing' | 'technical',
        token: uuidv4(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // TODO: Send invitation email via Azure Communication Services

    res.status(201).json({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  },
);

/**
 * POST /api/invitations/:token/accept — accept an invitation
 */
router.post('/invitations/:token/accept', async (req: Request, res: Response) => {
  const invitation = await prisma.orgInvitation.findUnique({
    where: { token: param(req, 'token') },
  });

  if (!invitation) {
    res.status(404).json({ error: 'Invitation not found' });
    return;
  }

  if (invitation.acceptedAt) {
    res.status(400).json({ error: 'Invitation has already been accepted' });
    return;
  }

  if (invitation.expiresAt < new Date()) {
    res.status(400).json({ error: 'Invitation has expired' });
    return;
  }

  if (invitation.email !== req.user!.email) {
    res.status(403).json({ error: 'This invitation is for a different email address' });
    return;
  }

  await prisma.$transaction([
    prisma.orgMembership.create({
      data: {
        userId: req.user!.id,
        orgId: invitation.orgId,
        role: invitation.role,
        acceptedAt: new Date(),
      },
    }),
    prisma.orgInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    }),
  ]);

  res.json({ message: 'Invitation accepted', orgId: invitation.orgId });
});

/**
 * DELETE /api/organisations/:orgId/invitations/:invitationId — cancel a pending invitation
 */
router.delete(
  '/:orgId/invitations/:invitationId',
  requireOrgRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const invitationId = param(req, 'invitationId');

    const invitation = await prisma.orgInvitation.findFirst({
      where: { id: invitationId, orgId, acceptedAt: null },
    });
    if (!invitation) {
      res.status(404).json({ error: 'Invitation not found' });
      return;
    }

    await prisma.orgInvitation.delete({ where: { id: invitationId } });
    res.json({ message: 'Invitation cancelled' });
  },
);

/**
 * PATCH /api/organisations/:orgId/members/:userId/role — update member role (owner only)
 * Supports transferring ownership: if new role is 'owner', the current owner becomes 'admin'.
 */
router.patch(
  '/:orgId/members/:userId/role',
  requireOrgRole('owner'),
  async (req: Request, res: Response) => {
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const orgId = param(req, 'orgId');
    const targetUserId = param(req, 'userId');
    const newRole = parsed.data.role as 'owner' | 'admin' | 'billing' | 'technical';

    // Cannot change own role (except via owner transfer which is done on the target)
    if (targetUserId === req.user!.id) {
      res.status(400).json({ error: 'Cannot change your own role' });
      return;
    }

    const targetMembership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });
    if (!targetMembership) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    if (newRole === 'owner') {
      // Transfer ownership: target becomes owner, current owner becomes admin
      await prisma.$transaction([
        prisma.orgMembership.update({
          where: { userId_orgId: { userId: targetUserId, orgId } },
          data: { role: 'owner' },
        }),
        prisma.orgMembership.update({
          where: { userId_orgId: { userId: req.user!.id, orgId } },
          data: { role: 'admin' },
        }),
      ]);
      res.json({ message: 'Ownership transferred' });
    } else {
      await prisma.orgMembership.update({
        where: { userId_orgId: { userId: targetUserId, orgId } },
        data: { role: newRole },
      });
      res.json({ message: 'Role updated' });
    }
  },
);

/**
 * DELETE /api/organisations/:orgId/members/:userId — remove member
 */
router.delete(
  '/:orgId/members/:userId',
  requireOrgRole('owner', 'admin'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const targetUserId = param(req, 'userId');

    const targetMembership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });
    if (!targetMembership) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }
    if (targetMembership.role === 'owner') {
      res.status(400).json({ error: 'Cannot remove the organisation owner' });
      return;
    }

    await prisma.orgMembership.delete({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });

    res.json({ message: 'Member removed' });
  },
);

export default router;
