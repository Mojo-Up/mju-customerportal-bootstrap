import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/versions/latest
 *
 * PUBLIC endpoint — returns latest {{PRODUCT_NAME}} version info.
 * Consumed by the {{PRODUCT_NAME}} Code App to check for updates.
 */
router.get('/latest', async (_req: Request, res: Response) => {
  // TODO: source from DB or config
  res.json({
    version: '1.0.0',
    releaseDate: '2026-03-26T00:00:00.000Z',
    releaseNotes: 'Initial release',
    downloadUrl: null,
  });
});

export default router;
