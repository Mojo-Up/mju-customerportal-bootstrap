import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { LicenceType } from '@{{ORG_SCOPE}}/shared';
import { generateActivationCode, verifyActivationCode } from '../services/activation.js';

const router = Router();

/**
 * Simple semver comparison: returns true if latest > current.
 * Handles "major.minor.patch" format.
 */
function isNewerVersion(current: string, latest: string): boolean {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

/**
 * POST /api/checkin
 *
 * Machine-to-machine endpoint called by Mojo PPM daily to renew activation codes.
 * No user auth required — the current activation code serves as proof of identity.
 *
 * Body: {
 *   activationCode: string,
 *   productId?: string,       // Product UUID — used to check for updates
 *   currentVersion?: string   // e.g. "1.2.0" — compared against latest available
 * }
 *
 * Returns: {
 *   activationCode: string,
 *   expiresAt: string | null,
 *   licence: { type, status, plan, endDate },
 *   update: { available, latestVersion, releaseNotes, downloadUrl } | null,
 *   contacts: {
 *     technical: string[],   // emails of technical role members
 *     billing: string[],     // emails of billing + owner role members (only if billing issue)
 *     billingIssue: string | null  // e.g. "past_due" or "cancelled"
 *   }
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  const { activationCode, productId, currentVersion } = req.body;

  if (!activationCode || typeof activationCode !== 'string') {
    res.status(400).json({ error: 'activationCode is required' });
    return;
  }

  // Verify the HMAC signature of the presented code
  const verified = verifyActivationCode(activationCode, config.activationHmacKey);
  if (!verified) {
    res.status(401).json({ error: 'Invalid activation code' });
    return;
  }

  // Find the environment by fingerprint
  const fp = verified.fingerprint;
  const envCodeUpper =
    `${fp.slice(0, 4)}-${fp.slice(4, 8)}-${fp.slice(8, 12)}-${fp.slice(12, 16)}`.toUpperCase();

  const environment = await prisma.environment.findFirst({
    where: { environmentCode: envCodeUpper },
    include: {
      licence: {
        include: {
          subscription: true,
          org: {
            include: {
              memberships: {
                include: { user: { select: { email: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!environment) {
    res.status(404).json({ error: 'Environment not found' });
    return;
  }

  const licence = environment.licence;
  const subscription = licence.subscription;

  // Determine subscription/billing status
  let billingIssue: string | null = null;

  if (licence.type === 'subscription') {
    if (!subscription) {
      res.status(403).json({ error: 'Subscription not linked' });
      return;
    }
    if (subscription.status === 'cancelled') {
      billingIssue = 'cancelled';
      // Still issue a code — let the current period expire naturally
    }
    if (subscription.status === 'past_due') {
      billingIssue = 'past_due';
    }
  } else if (licence.type === 'time_limited') {
    if (licence.expiryDate && licence.expiryDate < new Date()) {
      res.status(403).json({ error: 'Licence expired' });
      return;
    }
  }

  // Build the new activation code with fresh dates
  let licenceTypeCode: LicenceType;
  let endDate: Date | undefined;
  let subscriptionId: string | undefined;

  switch (licence.type) {
    case 'subscription': {
      licenceTypeCode = LicenceType.Subscription;
      endDate = subscription!.endDate;
      subscriptionId = subscription!.id;
      break;
    }
    case 'time_limited': {
      licenceTypeCode = LicenceType.TimeLimited;
      endDate = licence.expiryDate ?? undefined;
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

  const newCode = generateActivationCode({
    environmentCode: environment.environmentCode,
    licenceType: licenceTypeCode,
    hmacKey: config.activationHmacKey,
    subscriptionId,
    endDate,
  });

  // Save audit record and update check-in timestamp
  await prisma.$transaction([
    prisma.activationCode.create({
      data: {
        environmentId: environment.id,
        licenceId: licence.id,
        licenceType: licenceTypeCode,
        code: newCode,
        endDate: endDate ?? null,
      },
    }),
    prisma.environment.update({
      where: { id: environment.id },
      data: { activatedAt: new Date() },
    }),
  ]);

  // ─── Version check ──────────────────────────────────────────────────────
  let update: {
    available: boolean;
    latestVersion: string;
    releaseNotes: string | null;
    downloadUrl: string | null;
  } | null = null;

  if (
    productId &&
    typeof productId === 'string' &&
    currentVersion &&
    typeof currentVersion === 'string'
  ) {
    // Find the latest download of category "solution" for this product
    const latestDownload = await prisma.fileDownload.findFirst({
      where: { productId, category: 'solution' },
      orderBy: { createdAt: 'desc' },
      select: { version: true, description: true, blobPath: true },
    });

    if (latestDownload) {
      update = {
        available: isNewerVersion(currentVersion, latestDownload.version),
        latestVersion: latestDownload.version,
        releaseNotes: latestDownload.description,
        downloadUrl: null, // Downloads require portal auth — direct user to portal
      };
    }
  }

  // ─── Contact emails ─────────────────────────────────────────────────────
  const memberships = licence.org.memberships;

  const ownerEmails = memberships.filter((m) => m.role === 'owner').map((m) => m.user.email);

  const technicalEmails = memberships
    .filter((m) => m.role === 'technical' || m.role === 'admin')
    .map((m) => m.user.email);

  // Fall back to owner if no dedicated technical/admin contacts
  const effectiveTechnical = technicalEmails.length > 0 ? technicalEmails : ownerEmails;

  // Only include billing contacts if there's a billing/subscription issue
  let effectiveBilling: string[] = [];
  if (billingIssue) {
    const billingEmails = memberships.filter((m) => m.role === 'billing').map((m) => m.user.email);
    // Fall back to owner if no dedicated billing contacts
    effectiveBilling = billingEmails.length > 0 ? [...billingEmails, ...ownerEmails] : ownerEmails;
  }

  res.json({
    activationCode: newCode,
    expiresAt: endDate?.toISOString() ?? null,
    licence: {
      type: licence.type,
      status: subscription?.status ?? 'active',
      plan: subscription?.plan ?? null,
      endDate: endDate?.toISOString() ?? null,
    },
    update,
    contacts: {
      technical: [...new Set(effectiveTechnical)],
      billing: [...new Set(effectiveBilling)],
      billingIssue,
    },
  });
});

export default router;
