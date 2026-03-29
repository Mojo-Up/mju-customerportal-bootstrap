import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './lib/config.js';

// Route imports
import versionRoutes from './routes/versions.js';
import productRoutes from './routes/products.js';
import organisationRoutes from './routes/organisations.js';
import licenceRoutes from './routes/licences.js';
import billingRoutes from './routes/billing.js';
import ticketRoutes from './routes/tickets.js';
import downloadRoutes from './routes/downloads.js';
import adminRoutes from './routes/admin.js';
import checkinRoutes from './routes/checkin.js';
import stripeWebhookRoutes from './routes/webhooks/stripe.js';

const app = express();

// ─── Proxy Trust (required for rate limiting behind load balancer) ───────────
app.set('trust proxy', 1);

// ─── Security ───────────────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────────────────

// Public API CORS (subscription status + versions) — allow Power Apps domains
const publicApiCors = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedPatterns = [/\.powerapps\.com$/, /\.dynamics\.com$/];
    if (allowedPatterns.some((p) => p.test(origin))) {
      return callback(null, true);
    }
    // In development, also allow localhost
    if (!config.isProduction && /^https?:\/\/localhost/.test(origin)) {
      return callback(null, true);
    }
    callback(new Error('CORS not allowed'));
  },
});

// Portal API CORS — only the portal origin
const portalApiCors = cors({
  origin: config.isProduction ? config.portalUrl : true,
  credentials: true,
});

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const generalRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: { error: 'Rate limit exceeded' },
});

const checkinRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 per hour per IP — app only calls once daily
  message: { error: 'Check-in rate limit exceeded. Try again later.' },
});

// ─── Stripe Webhook (MUST use raw body — before JSON parser) ────────────────
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }), stripeWebhookRoutes);

// ─── Body Parsing (after webhook route to preserve raw body) ────────────────
app.use(express.json({ limit: '1mb' }));

// ─── Public Routes (no auth) ───────────────────────────────────────────────
app.use('/api/versions', publicApiCors, generalRateLimit, versionRoutes);
app.use('/api/products', portalApiCors, generalRateLimit, productRoutes);
app.use('/api/checkin', publicApiCors, checkinRateLimit, checkinRoutes);

// ─── Authenticated Portal Routes ────────────────────────────────────────────
import { authenticate } from './middleware/auth.js';

app.get('/api/me', portalApiCors, generalRateLimit, authenticate, (req, res) => {
  const u = req.user!;
  res.json({ id: u.id, email: u.email, name: u.name, isStaff: u.isStaff });
});

app.get('/api/me/invitations', portalApiCors, generalRateLimit, authenticate, async (req, res) => {
  const { prisma } = await import('./lib/prisma.js');
  const invitations = await prisma.orgInvitation.findMany({
    where: { email: req.user!.email, acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { org: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    invitations.map((i) => ({
      id: i.id,
      orgId: i.orgId,
      orgName: i.org.name,
      role: i.role,
      token: i.token,
      expiresAt: i.expiresAt,
    })),
  );
});

app.use('/api/organisations', portalApiCors, generalRateLimit, organisationRoutes);
app.use('/api/organisations', portalApiCors, generalRateLimit, licenceRoutes);
app.use('/api/organisations', portalApiCors, generalRateLimit, billingRoutes);
app.use('/api/organisations', portalApiCors, generalRateLimit, ticketRoutes);
app.use('/api/downloads', portalApiCors, generalRateLimit, downloadRoutes);
app.use('/api/admin', portalApiCors, generalRateLimit, adminRoutes);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Error Handler ──────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: config.isProduction ? 'Internal server error' : err.message,
  });
});

// ─── Start ──────────────────────────────────────────────────────────────────
app.listen(config.port, () => {
  console.log(`{{PROJECT_NAME}} API running on port ${config.port}`);
  console.log(`  Health: http://localhost:${config.port}/health`);
  console.log(`  Env: ${config.nodeEnv}`);
});

export default app;
