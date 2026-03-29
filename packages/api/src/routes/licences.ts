import { Router, Request, Response } from 'express';
import { param } from '../lib/params.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { createEnvironmentSchema, activateEnvironmentSchema, LicenceType } from '@{{ORG_SCOPE}}/shared';
import { generateActivationCode, isValidEnvironmentCode } from '../services/activation.js';

const router = Router();

router.use(authenticate);

/**
 * GET /api/organisations/:orgId/licences — list all licences for an org
 */
router.get(
  '/:orgId/licences',
  requireOrgRole('owner', 'admin', 'billing', 'technical'),
  async (req: Request, res: Response) => {
    const licences = await prisma.licence.findMany({
      where: { orgId: param(req, 'orgId') },
      include: {
        product: { select: { id: true, name: true } },
        subscription: {
          select: {
            id: true,
            plan: true,
            status: true,
            startDate: true,
            endDate: true,
            stripePriceId: true,
          },
        },
        _count: { select: { environments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      licences.map((l) => ({
        id: l.id,
        type: l.type,
        productName: l.product.name,
        subscription: l.subscription,
        expiryDate: l.expiryDate,
        maxEnvironments: l.maxEnvironments,
        environmentCount: l._count.environments,
        createdAt: l.createdAt,
      })),
    );
  },
);

/**
 * GET /api/organisations/:orgId/licences/:licenceId/environments
 */
router.get(
  '/:orgId/licences/:licenceId/environments',
  requireOrgRole('owner', 'admin', 'technical'),
  async (req: Request, res: Response) => {
    const environments = await prisma.environment.findMany({
      where: { licenceId: param(req, 'licenceId'), licence: { orgId: param(req, 'orgId') } },
      include: {
        activationCodes: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(
      environments.map((env) => ({
        id: env.id,
        environmentCode: env.environmentCode,
        name: env.name,
        activatedAt: env.activatedAt,
        createdAt: env.createdAt,
        lastCheckIn: env.activationCodes[0]?.createdAt ?? null,
      })),
    );
  },
);

/**
 * POST /api/organisations/:orgId/licences/:licenceId/environments — register new environment
 */
router.post(
  '/:orgId/licences/:licenceId/environments',
  requireOrgRole('owner', 'admin', 'technical'),
  async (req: Request, res: Response) => {
    const parsed = createEnvironmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const licenceId = param(req, 'licenceId');
    const orgId = param(req, 'orgId');

    const licence = await prisma.licence.findFirst({
      where: { id: licenceId, orgId },
      include: { _count: { select: { environments: true } } },
    });

    if (!licence) {
      res.status(404).json({ error: 'Licence not found' });
      return;
    }

    if (licence._count.environments >= licence.maxEnvironments) {
      res.status(400).json({
        error: `Environment limit reached (${licence.maxEnvironments}). Contact {{PROJECT_NAME}} to request an increase.`,
      });
      return;
    }

    // Check for duplicate environment code on this licence
    const existing = await prisma.environment.findUnique({
      where: {
        licenceId_environmentCode: {
          licenceId,
          environmentCode: parsed.data.environmentCode.toUpperCase(),
        },
      },
    });
    if (existing) {
      res.status(409).json({ error: 'This environment code is already registered' });
      return;
    }

    const environment = await prisma.environment.create({
      data: {
        licenceId,
        environmentCode: parsed.data.environmentCode.toUpperCase(),
        name: parsed.data.name,
      },
    });

    res.status(201).json(environment);
  },
);

/**
 * POST /api/organisations/:orgId/licences/:licenceId/environments/:envId/activate
 *
 * Generate an activation code for a specific environment.
 */
router.post(
  '/:orgId/licences/:licenceId/environments/:envId/activate',
  requireOrgRole('owner', 'admin', 'technical'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const licenceId = param(req, 'licenceId');
    const envId = param(req, 'envId');

    const environment = await prisma.environment.findFirst({
      where: { id: envId, licenceId, licence: { orgId } },
      include: {
        licence: {
          include: { subscription: true },
        },
      },
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

    // Portal only generates subscription codes for customers.
    // Time-limited and unlimited are ISV-only (admin/staff).
    if (licence.type !== 'subscription' && !req.user!.isStaff) {
      res.status(403).json({
        error: 'Only subscription activation codes can be generated through the portal',
      });
      return;
    }

    const activationCode = generateActivationCode({
      environmentCode: environment.environmentCode,
      licenceType: licenceTypeCode,
      hmacKey: config.activationHmacKey,
      subscriptionId,
      endDate,
    });

    // Save audit record and update environment
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
 * PATCH /api/organisations/:orgId/licences/:licenceId/environments/:envId
 */
router.patch(
  '/:orgId/licences/:licenceId/environments/:envId',
  requireOrgRole('owner', 'admin', 'technical'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const licenceId = param(req, 'licenceId');
    const envId = param(req, 'envId');
    const { name } = req.body;

    const environment = await prisma.environment.findFirst({
      where: { id: envId, licenceId, licence: { orgId } },
    });
    if (!environment) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    const updated = await prisma.environment.update({
      where: { id: envId },
      data: { name: name ?? null },
    });

    res.json(updated);
  },
);

/**
 * DELETE /api/organisations/:orgId/licences/:licenceId/environments/:envId
 */
router.delete(
  '/:orgId/licences/:licenceId/environments/:envId',
  requireOrgRole('owner', 'admin', 'technical'),
  async (req: Request, res: Response) => {
    const orgId = param(req, 'orgId');
    const licenceId = param(req, 'licenceId');
    const envId = param(req, 'envId');

    const environment = await prisma.environment.findFirst({
      where: { id: envId, licenceId, licence: { orgId } },
    });
    if (!environment) {
      res.status(404).json({ error: 'Environment not found' });
      return;
    }

    await prisma.environment.delete({ where: { id: envId } });

    res.json({ message: 'Environment removed' });
  },
);

export default router;
