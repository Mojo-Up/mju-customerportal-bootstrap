import { Router, Request, Response } from 'express';
import { config } from '../../lib/config.js';
import { prisma } from '../../lib/prisma.js';
import { stripe } from '../../services/stripe.js';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

const router = Router();

/**
 * POST /api/webhooks/stripe
 *
 * Stripe webhook handler. Uses raw body for signature verification.
 * This route must NOT use JSON body parser — raw body is required.
 */
router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string | undefined;
  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', message);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      break;

    default:
      // Unhandled event type — acknowledge receipt
      break;
  }

  res.json({ received: true });
});

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription' || !session.subscription) return;

  const orgId = session.metadata?.orgId;
  const productId = session.metadata?.productId;
  const plan = session.metadata?.plan as 'monthly' | 'annual' | undefined;
  if (!orgId || !productId || !plan) {
    console.error('Checkout session missing orgId, productId, or plan metadata');
    return;
  }

  const stripeSubId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

  // Idempotency: skip if subscription already exists
  const existing = await prisma.subscription.findFirst({
    where: { stripeSubscriptionId: stripeSubId },
  });
  if (existing) return;

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);

  const subscriptionId = `SUB-${uuidv4().split('-')[0].toUpperCase()}`;
  const startDate = new Date(stripeSubscription.current_period_start * 1000);
  const endDate = new Date(stripeSubscription.current_period_end * 1000);

  await prisma.$transaction([
    prisma.subscription.create({
      data: {
        id: subscriptionId,
        orgId,
        productId,
        plan,
        status: 'active',
        startDate,
        endDate,
        stripeSubscriptionId: stripeSubscription.id,
        stripePriceId: stripeSubscription.items.data[0]?.price.id,
      },
    }),
    prisma.licence.create({
      data: {
        orgId,
        productId,
        type: 'subscription',
        subscriptionId,
        maxEnvironments: 5,
      },
    }),
  ]);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const stripeSubId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!stripeSubId) return;

  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
  const endDate = new Date(stripeSubscription.current_period_end * 1000);

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSubId },
    data: { status: 'active', endDate },
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const stripeSubId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!stripeSubId) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSubId },
    data: { status: 'past_due' },
  });
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: sub.id },
    data: { status: 'cancelled' },
  });
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const endDate = new Date(sub.current_period_end * 1000);
  const status =
    sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : undefined;

  if (status) {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: sub.id },
      data: { status, endDate },
    });
  }
}

export default router;
