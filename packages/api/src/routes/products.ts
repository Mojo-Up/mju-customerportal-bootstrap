import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';

const router: Router = Router();

/**
 * GET /api/products — list all active products with pricing plans (public)
 */
router.get('/', async (_req: Request, res: Response) => {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    include: {
      pricingPlans: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
    orderBy: { sortOrder: 'asc' },
  });

  res.json(products);
});

/**
 * GET /api/products/:slug — single product detail by slug (public)
 */
router.get('/:slug', async (req: Request, res: Response) => {
  const slug = req.params.slug as string;

  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      pricingPlans: {
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!product || !product.isActive) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  res.json(product);
});

export default router;
