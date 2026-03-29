import { Router, Request, Response } from 'express';
import { param } from '../lib/params.js';
import { authenticate } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob';

const router = Router();

router.use(authenticate);

/**
 * GET /api/downloads — list available files
 */
router.get('/', async (req: Request, res: Response) => {
  const { category } = req.query;

  const where = category ? { category: category as 'solution' | 'powerbi' | 'guide' } : {};

  const files = await prisma.fileDownload.findMany({
    where,
    orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }],
  });

  res.json(
    files.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      category: f.category,
      version: f.version,
      fileSize: Number(f.fileSize),
      updatedAt: f.updatedAt,
    })),
  );
});

/**
 * GET /api/downloads/:fileId/url — generate a time-limited download URL
 *
 * For now returns a placeholder. In production, generates an Azure Blob SAS URL.
 */
router.get('/:fileId/url', async (req: Request, res: Response) => {
  // Verify user is in at least one org (any authenticated user can download)
  const membership = await prisma.orgMembership.findFirst({
    where: { userId: req.user!.id },
  });
  if (!membership) {
    res.status(403).json({ error: 'You must belong to an organisation to download files' });
    return;
  }

  const file = await prisma.fileDownload.findUnique({
    where: { id: param(req, 'fileId') },
  });
  if (!file) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  // Log the download
  await prisma.downloadLog.create({
    data: {
      fileId: file.id,
      userId: req.user!.id,
      orgId: membership.orgId,
    },
  });

  // Generate time-limited Azure Blob SAS URL
  if (!config.azureStorage.connectionString) {
    res.status(503).json({ error: 'Storage not configured' });
    return;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    config.azureStorage.connectionString,
  );

  // Extract account name and key from connection string for SAS generation
  const sharedKeyCredential = blobServiceClient.credential as StorageSharedKeyCredential;

  const containerName = config.azureStorage.containerName;
  // blobPath may include the container name as prefix, or be just the blob name
  const blobName = file.blobPath.startsWith(`${containerName}/`)
    ? file.blobPath.slice(containerName.length + 1)
    : file.blobPath;

  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + 15);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse('r'),
      expiresOn,
    },
    sharedKeyCredential,
  ).toString();

  const containerClient = blobServiceClient.getContainerClient(containerName);
  const blobClient = containerClient.getBlobClient(blobName);

  res.json({
    url: `${blobClient.url}?${sasToken}`,
    expiresIn: 900, // 15 minutes
  });
});

export default router;
