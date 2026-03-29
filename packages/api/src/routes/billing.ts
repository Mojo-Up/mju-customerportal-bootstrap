import { Router, Request, Response } from 'express';
import { param } from '../lib/params.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { stripe } from '../services/stripe.js';
import { createCheckoutSessionSchema } from '@{{ORG_SCOPE}}/shared';

const router = Router();

router.use(authenticate);

/**
 * POST /api/organisations/:orgId/billing/checkout-session
 *
 * Create a Stripe Checkout Session (redirect mode) for subscription purchase.
 * No billing data is stored in our app — everything is on Stripe.
 */
router.post(
  '/:orgId/billing/checkout-session',
  requireOrgRole('owner', 'admin', 'billing'),
  async (req: Request, res: Response) => {
    const parsed = createCheckoutSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      return;
    }

    const { productId, pricingPlanId } = parsed.data;
    const orgId = param(req, 'orgId');

    const org = await prisma.organisation.findUnique({ where: { id: orgId } });
    if (!org) {
      res.status(404).json({ error: 'Organisation not found' });
      return;
    }

    // Look up the pricing plan to get the Stripe price ID
    const pricingPlan = await prisma.productPricingPlan.findUnique({
      where: { id: pricingPlanId },
      include: { product: { select: { id: true, slug: true } } },
    });
    if (!pricingPlan || !pricingPlan.isActive || pricingPlan.productId !== productId) {
      res.status(400).json({ error: 'Invalid pricing plan' });
      return;
    }

    // Reuse existing Stripe customer or create one
    let stripeCustomerId = org.stripeCustomerId;
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: req.user!.email,
        metadata: { orgId: org.id },
      });
      stripeCustomerId = customer.id;
      await prisma.organisation.update({
        where: { id: orgId },
        data: { stripeCustomerId: customer.id },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: pricingPlan.stripePriceId, quantity: 1 }],
      success_url: `${config.portalUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.portalUrl}/products/${pricingPlan.product.slug}`,
      metadata: { orgId, productId, pricingPlanId, plan: pricingPlan.interval },
      subscription_data: {
        metadata: { orgId, productId, pricingPlanId, plan: pricingPlan.interval },
      },
    });

    res.json({ url: session.url });
  },
);

/**
 * POST /api/organisations/:orgId/billing/portal-session
 *
 * Create a Stripe Customer Portal session for billing management.
 * Customer manages payment methods, invoices, cancellation entirely on Stripe.
 */
router.post(
  '/:orgId/billing/portal-session',
  requireOrgRole('owner', 'admin', 'billing'),
  async (req: Request, res: Response) => {
    const org = await prisma.organisation.findUnique({ where: { id: param(req, 'orgId') } });
    if (!org?.stripeCustomerId) {
      res.status(400).json({ error: 'No billing account found. Please subscribe first.' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${config.portalUrl}/organisations/${org.id}/billing`,
    });

    res.json({ url: session.url });
  },
);

export default router;
