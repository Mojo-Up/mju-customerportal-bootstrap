import { Router, Request, Response } from 'express';
import { param } from '../lib/params.js';
import { authenticate } from '../middleware/auth.js';
import { requireStaff } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { generateActivationCode, isValidEnvironmentCode } from '../services/activation.js';
import {
  LicenceType,
  createProductSchema,
  updateProductSchema,
  createPricingPlanSchema,
  updatePricingPlanSchema,
  createOrgSchema,
  inviteMemberSchema,
  paginationSchema,
} from '@{{ORG_SCOPE}}/shared';
import { v4 as uuidv4 } from 'uuid';

const router: Router = Router();

router.use(authenticate);
router.use(requireStaff);

// ─── Dashboard Statistics ───────────────────────────────────────────────────

/**
 * GET /api/admin/stats — overall dashboard statistics
 */
router.get('/stats', async (_req: Request, res: Response) => {
  const [orgCount, userCount, activeSubCount, totalSubCount, ticketCount, productCount] =
    await prisma.$transaction([
      prisma.organisation.count(),
      prisma.user.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count(),
      prisma.supportTicket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      prisma.product.count({ where: { isActive: true } }),
    ]);

  res.json({
    organisations: orgCount,
    users: userCount,
    activeSubscriptions: activeSubCount,
    totalSubscriptions: totalSubCount,
    openTickets: ticketCount,
    products: productCount,
  });
});

// ─── Product Dashboard ──────────────────────────────────────────────────────

/**
 * GET /api/admin/products/:productId/dashboard — per-product dashboard
 */
router.get('/products/:productId/dashboard', async (req: Request, res: Response) => {
  const productId = param(req, 'productId');

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const [activeSubCount, totalSubCount, licenceCount, envCount, ticketCount, downloadCount] =
    await prisma.$transaction([
      prisma.subscription.count({ where: { productId, status: 'active' } }),
      prisma.subscription.count({ where: { productId } }),
      prisma.licence.count({ where: { productId } }),
      prisma.environment.count({ where: { licence: { productId } } }),
      prisma.supportTicket.count({ where: { productId, status: { in: ['open', 'in_progress'] } } }),
      prisma.downloadLog.count({ where: { file: { productId } } }),
    ]);

  // Subscriptions by plan
  const subsByPlan = await prisma.subscription.groupBy({
    by: ['plan'],
    where: { productId, status: 'active' },
    _count: true,
  });

  // Recent subscriptions
  const recentSubs = await prisma.subscription.findMany({
    where: { productId },
    include: { org: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  res.json({
    product,
    stats: {
      activeSubscriptions: activeSubCount,
      totalSubscriptions: totalSubCount,
      licences: licenceCount,
      environments: envCount,
      openTickets: ticketCount,
      totalDownloads: downloadCount,
    },
    subscriptionsByPlan: subsByPlan.map((s) => ({ plan: s.plan, count: s._count })),
    recentSubscriptions: recentSubs,
  });
});

// ─── Product CRUD ───────────────────────────────────────────────────────────

/**
 * GET /api/admin/products — list all products (including inactive)
 */
router.get('/products', async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    include: {
      pricingPlans: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { subscriptions: true, licences: true, downloads: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  res.json(products);
});

/**
 * POST /api/admin/products — create a new product
 */
router.post('/products', async (req: Request, res: Response) => {
  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name, description, iconUrl, logoUrl, features } = parsed.data;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) {
    res.status(409).json({ error: 'A product with a similar name already exists' });
    return;
  }

  const product = await prisma.product.create({
    data: { name, slug, description, iconUrl, logoUrl, features: features ?? [] },
  });

  res.status(201).json(product);
});

/**
 * PATCH /api/admin/products/:productId — update a product
 */
router.patch('/products/:productId', async (req: Request, res: Response) => {
  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const productId = param(req, 'productId');
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const updated = await prisma.product.update({
    where: { id: productId },
    data: parsed.data,
  });

  res.json(updated);
});

// ─── Pricing Plans ──────────────────────────────────────────────────────────

/**
 * POST /api/admin/products/:productId/pricing-plans — add a pricing plan
 */
router.post('/products/:productId/pricing-plans', async (req: Request, res: Response) => {
  const parsed = createPricingPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const productId = param(req, 'productId');
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const plan = await prisma.productPricingPlan.create({
    data: { productId, ...parsed.data, features: parsed.data.features ?? [] },
  });

  res.status(201).json(plan);
});

/**
 * PATCH /api/admin/products/:productId/pricing-plans/:planId — update a pricing plan
 */
router.patch('/products/:productId/pricing-plans/:planId', async (req: Request, res: Response) => {
  const parsed = updatePricingPlanSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const planId = param(req, 'planId');

  const plan = await prisma.productPricingPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.productId !== param(req, 'productId')) {
    res.status(404).json({ error: 'Pricing plan not found' });
    return;
  }

  const updated = await prisma.productPricingPlan.update({
    where: { id: planId },
    data: parsed.data,
  });

  res.json(updated);
});

/**
 * DELETE /api/admin/products/:productId/pricing-plans/:planId — delete a pricing plan
 */
router.delete('/products/:productId/pricing-plans/:planId', async (req: Request, res: Response) => {
  const planId = param(req, 'planId');
  const productId = param(req, 'productId');

  const plan = await prisma.productPricingPlan.findUnique({ where: { id: planId } });
  if (!plan || plan.productId !== productId) {
    res.status(404).json({ error: 'Pricing plan not found' });
    return;
  }

  await prisma.productPricingPlan.delete({ where: { id: planId } });

  res.json({ message: 'Pricing plan deleted' });
});

// ─── Organisation Management ────────────────────────────────────────────────

/**
 * GET /api/admin/organisations — search organisations
 */
router.get('/organisations', async (req: Request, res: Response) => {
  const { search } = req.query;
  const pagination = paginationSchema.safeParse(req.query);
  const { page, limit } = pagination.success ? pagination.data : { page: 1, limit: 20 };
  const skip = (page - 1) * limit;
  const take = limit;

  const where = search
    ? {
        OR: [{ name: { contains: search as string, mode: 'insensitive' as const } }],
      }
    : {};

  const [orgs, total] = await prisma.$transaction([
    prisma.organisation.findMany({
      where,
      include: {
        _count: { select: { memberships: true, subscriptions: true, licences: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.organisation.count({ where }),
  ]);

  res.json({ data: orgs, pagination: { page, limit: take, total } });
});

/**
 * GET /api/admin/organisations/:orgId — full org detail for admin
 */
router.get('/organisations/:orgId', async (req: Request, res: Response) => {
  const org = await prisma.organisation.findUnique({
    where: { id: param(req, 'orgId') },
    include: {
      memberships: { include: { user: { select: { id: true, email: true, name: true } } } },
      subscriptions: { include: { product: { select: { id: true, name: true, slug: true } } } },
      licences: {
        include: {
          product: { select: { id: true, name: true } },
          subscription: { select: { id: true, endDate: true } },
          environments: {
            select: { id: true, name: true, environmentCode: true, activatedAt: true },
            orderBy: { name: 'asc' },
          },
          _count: { select: { environments: true } },
        },
      },
      _count: { select: { tickets: true } },
    },
  });

  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  res.json(org);
});

/**
 * PATCH /api/admin/organisations/:orgId — update org (e.g. set staff flags)
 */
router.patch('/organisations/:orgId', async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');
  const { name } = req.body;

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  const updated = await prisma.organisation.update({
    where: { id: orgId },
    data: { ...(name && { name }) },
  });

  res.json(updated);
});

/**
 * POST /api/admin/organisations — admin creates an org (with optional owner email)
 */
router.post('/organisations', async (req: Request, res: Response) => {
  const parsed = createOrgSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const { name } = parsed.data;
  const { ownerEmail } = req.body;

  // If ownerEmail provided, find or note user
  let ownerId: string | undefined;
  if (ownerEmail) {
    const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
    if (user) {
      ownerId = user.id;
    } else {
      res.status(400).json({
        error: `User with email ${ownerEmail} not found. They must sign up first.`,
      });
      return;
    }
  }

  const org = await prisma.organisation.create({
    data: {
      name,
      ...(ownerId && {
        memberships: {
          create: {
            userId: ownerId,
            role: 'owner',
            acceptedAt: new Date(),
          },
        },
      }),
    },
  });

  res.status(201).json({
    id: org.id,
    customerId: org.customerId,
    name: org.name,
  });
});

/**
 * POST /api/admin/organisations/:orgId/invitations — admin invites a user to an org
 */
router.post('/organisations/:orgId/invitations', async (req: Request, res: Response) => {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const orgId = param(req, 'orgId');
  const { email, role } = parsed.data;

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

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

  const invitation = await prisma.orgInvitation.create({
    data: {
      orgId,
      email,
      role,
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days for admin invites
    },
  });

  res.status(201).json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
  });
});

/**
 * POST /api/admin/organisations/:orgId/members — admin directly adds a user as member (no invite needed)
 */
router.post('/organisations/:orgId/members', async (req: Request, res: Response) => {
  const parsed = inviteMemberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }

  const orgId = param(req, 'orgId');
  const { email, role } = parsed.data;

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    res.status(404).json({ error: `User with email ${email} not found. They must sign up first.` });
    return;
  }

  const existingMembership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId: user.id, orgId } },
  });
  if (existingMembership) {
    res.status(409).json({ error: 'User is already a member of this organisation' });
    return;
  }

  // If assigning owner, demote any existing owner to admin
  if (role === 'owner') {
    const currentOwner = await prisma.orgMembership.findFirst({
      where: { orgId, role: 'owner' },
    });
    if (currentOwner) {
      await prisma.orgMembership.update({
        where: { userId_orgId: { userId: currentOwner.userId, orgId } },
        data: { role: 'admin' },
      });
    }
  }

  const membership = await prisma.orgMembership.create({
    data: {
      userId: user.id,
      orgId,
      role,
      acceptedAt: new Date(),
    },
  });

  res.status(201).json({ userId: membership.userId, role: membership.role });
});

/**
 * PATCH /api/admin/organisations/:orgId/members/:userId/role — admin changes a member's role
 */
router.patch('/organisations/:orgId/members/:userId/role', async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');
  const userId = param(req, 'userId');
  const { role } = req.body;

  const validRoles = ['owner', 'admin', 'billing', 'technical'];
  if (!role || !validRoles.includes(role)) {
    res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
    return;
  }

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }

  // If promoting to owner, demote existing owner to admin
  if (role === 'owner' && membership.role !== 'owner') {
    const currentOwner = await prisma.orgMembership.findFirst({
      where: { orgId, role: 'owner' },
    });
    if (currentOwner) {
      await prisma.orgMembership.update({
        where: { userId_orgId: { userId: currentOwner.userId, orgId } },
        data: { role: 'admin' },
      });
    }
  }

  await prisma.orgMembership.update({
    where: { userId_orgId: { userId, orgId } },
    data: { role },
  });

  res.json({ message: 'Role updated' });
});

/**
 * DELETE /api/admin/organisations/:orgId/members/:userId — admin removes a member
 */
router.delete('/organisations/:orgId/members/:userId', async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');
  const userId = param(req, 'userId');

  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
  });
  if (!membership) {
    res.status(404).json({ error: 'Member not found' });
    return;
  }
  if (membership.role === 'owner') {
    res
      .status(400)
      .json({ error: 'Cannot remove the organisation owner. Transfer ownership first.' });
    return;
  }

  await prisma.orgMembership.delete({
    where: { userId_orgId: { userId, orgId } },
  });

  res.json({ message: 'Member removed' });
});

// ─── User Management ────────────────────────────────────────────────────────

/**
 * GET /api/admin/users — search users
 */
router.get('/users', async (req: Request, res: Response) => {
  const { search } = req.query;
  const pagination = paginationSchema.safeParse(req.query);
  const { page, limit } = pagination.success ? pagination.data : { page: 1, limit: 20 };
  const skip = (page - 1) * limit;
  const take = limit;

  const where = search
    ? {
        OR: [
          { name: { contains: search as string, mode: 'insensitive' as const } },
          { email: { contains: search as string, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [users, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      include: {
        _count: { select: { memberships: true } },
        memberships: { include: { org: { select: { id: true, name: true, customerId: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  res.json({ data: users, pagination: { page, limit: take, total } });
});

/**
 * PATCH /api/admin/users/:userId/staff — toggle staff status
 */
router.patch('/users/:userId/staff', async (req: Request, res: Response) => {
  const userId = param(req, 'userId');
  const { isStaff } = req.body;

  if (typeof isStaff !== 'boolean') {
    res.status(400).json({ error: 'isStaff must be a boolean' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { isStaff },
  });

  res.json({ message: `User ${user.email} staff status set to ${isStaff}` });
});

/**
 * DELETE /api/admin/users/:userId — delete a user account
 * Blocked if user is owner of any organisation.
 */
router.delete('/users/:userId', async (req: Request, res: Response) => {
  const userId = param(req, 'userId');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { where: { role: 'owner' }, select: { org: { select: { name: true } } } },
    },
  });

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (user.memberships.length > 0) {
    const orgNames = user.memberships.map((m) => m.org.name).join(', ');
    res.status(400).json({
      error: `Cannot delete user who is owner of: ${orgNames}. Transfer ownership first.`,
    });
    return;
  }

  // Delete all memberships, then the user (cascade should handle invitations, download logs, tickets)
  await prisma.$transaction([
    prisma.orgMembership.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  res.json({ message: `User ${user.email} deleted` });
});

// ─── Activation Codes (ISV Override) ────────────────────────────────────────

/**
 * POST /api/admin/organisations/:orgId/licences/:licenceId/environments/:envId/activate
 * Staff can generate activation codes for any environment without being an org member.
 */
router.post(
  '/organisations/:orgId/licences/:licenceId/environments/:envId/activate',
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const licenceId = param(req, 'licenceId');
    const envId = param(req, 'envId');

    const environment = await prisma.environment.findFirst({
      where: { id: envId, licenceId, licence: { orgId } },
      include: { licence: { include: { subscription: true } } },
    });

    if (!environment) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    if (!isValidEnvironmentCode(environment.environmentCode)) {
      res.status(400).json({ error: 'Invalid environment code format' });
      return;
    }

    const licence = environment.licence;
    let licenceTypeCode: LicenceType;
    let endDate: Date | undefined;
    let subscriptionId: string | undefined;

    switch (licence.type) {
      case 'subscription': {
        if (!licence.subscription) {
          res.status(400).json({ error: 'Subscription not linked to licence' });
          return;
        }
        licenceTypeCode = LicenceType.Subscription;
        endDate = licence.subscription.endDate;
        subscriptionId = licence.subscription.id;
        break;
      }
      case 'time_limited': {
        if (!licence.expiryDate) {
          res.status(400).json({ error: 'Licence has no expiry date' });
          return;
        }
        licenceTypeCode = LicenceType.TimeLimited;
        endDate = licence.expiryDate;
        break;
      }
      case 'unlimited': {
        licenceTypeCode = LicenceType.Unlimited;
        break;
      }
      default:
        res.status(400).json({ error: 'Unsupported licence type' });
        return;
    }

    const activationCode = generateActivationCode({
      environmentCode: environment.environmentCode,
      licenceType: licenceTypeCode,
      hmacKey: config.activationHmacKey,
      subscriptionId,
      endDate,
    });

    await prisma.$transaction([
      prisma.activationCode.create({
        data: {
          environmentId: environment.id,
          licenceId: licence.id,
          licenceType: licenceTypeCode,
          code: activationCode,
          endDate,
        },
      }),
      prisma.environment.update({
        where: { id: environment.id },
        data: { activatedAt: new Date() },
      }),
    ]);

    res.json({ activationCode });
  },
);

/**
 * POST /api/admin/activate — generate activation code for any env/licence type (raw, no audit)
 */
router.post('/activate', async (req: Request, res: Response) => {
  const { environmentCode, licenceType, subscriptionId, endDate, days } = req.body;

  if (!environmentCode || !isValidEnvironmentCode(environmentCode)) {
    res.status(400).json({ error: 'Invalid environment code' });
    return;
  }

  const licType = licenceType as number;
  if (
    ![LicenceType.TimeLimited, LicenceType.Unlimited, LicenceType.Subscription].includes(licType)
  ) {
    res.status(400).json({ error: 'Invalid licence type' });
    return;
  }

  let computedEndDate: Date | undefined;
  if (licType === LicenceType.Subscription) {
    if (!subscriptionId || !endDate) {
      res.status(400).json({ error: 'subscriptionId and endDate required for subscription type' });
      return;
    }
    computedEndDate = new Date(endDate);
  } else if (licType === LicenceType.TimeLimited) {
    if (endDate) {
      computedEndDate = new Date(endDate);
    } else if (days && parseInt(days, 10) > 0) {
      computedEndDate = new Date();
      computedEndDate.setDate(computedEndDate.getDate() + parseInt(days, 10));
    } else {
      res.status(400).json({ error: 'endDate or days required for time-limited type' });
      return;
    }
  }

  const activationCode = generateActivationCode({
    environmentCode,
    licenceType: licType,
    hmacKey: config.activationHmacKey,
    subscriptionId,
    endDate: computedEndDate,
  });

  res.json({ activationCode });
});

// ─── Licence Management ─────────────────────────────────────────────────────

/**
 * PATCH /api/admin/licences/:licenceId/max-environments — approve environment increase
 */
router.patch('/licences/:licenceId/max-environments', async (req: Request, res: Response) => {
  const { maxEnvironments } = req.body;
  if (!maxEnvironments || maxEnvironments < 1) {
    res.status(400).json({ error: 'maxEnvironments must be a positive integer' });
    return;
  }

  const licence = await prisma.licence.findUnique({ where: { id: param(req, 'licenceId') } });
  if (!licence) {
    res.status(404).json({ error: 'Licence not found' });
    return;
  }

  await prisma.licence.update({
    where: { id: licence.id },
    data: { maxEnvironments },
  });

  res.json({ message: `Max environments updated to ${maxEnvironments}` });
});

// ─── Admin Licence Assignment ───────────────────────────────────────────────

/**
 * POST /api/admin/organisations/:orgId/licences — admin assigns a licence to an org
 */
router.post('/organisations/:orgId/licences', async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');
  const { productId, type, expiryDate, maxEnvironments = 5 } = req.body;

  if (!productId || !type) {
    res.status(400).json({ error: 'productId and type are required' });
    return;
  }

  if (!['time_limited', 'unlimited'].includes(type)) {
    res.status(400).json({ error: 'type must be time_limited or unlimited' });
    return;
  }

  if (type === 'time_limited' && !expiryDate) {
    res.status(400).json({ error: 'expiryDate is required for time_limited licences' });
    return;
  }

  const org = await prisma.organisation.findUnique({ where: { id: orgId } });
  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const licence = await prisma.licence.create({
    data: {
      orgId,
      productId,
      type,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      maxEnvironments,
    },
  });

  res.status(201).json(licence);
});

/**
 * DELETE /api/admin/organisations/:orgId — staff deletes an org
 * Blocked if active/past_due subscriptions exist.
 */
router.delete('/organisations/:orgId', async (req: Request, res: Response) => {
  const orgId = param(req, 'orgId');

  const org = await prisma.organisation.findUnique({
    where: { id: orgId },
    include: { subscriptions: { where: { status: { in: ['active', 'past_due'] } } } },
  });

  if (!org) {
    res.status(404).json({ error: 'Organisation not found' });
    return;
  }

  if (org.subscriptions.length > 0) {
    res.status(400).json({
      error: `Cannot delete organisation with ${org.subscriptions.length} active subscription(s). Cancel all subscriptions first.`,
    });
    return;
  }

  await prisma.organisation.delete({ where: { id: orgId } });

  res.json({ message: 'Organisation and all associated data deleted' });
});

export default router;
