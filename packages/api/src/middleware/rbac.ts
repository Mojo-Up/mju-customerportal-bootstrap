import { Request, Response, NextFunction } from 'express';
import { param } from '../lib/params.js';
import { OrgRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export interface OrgContext {
  orgId: string;
  role: OrgRole;
}

declare global {
  namespace Express {
    interface Request {
      orgContext?: OrgContext;
    }
  }
}

/**
 * Middleware factory: Require the authenticated user to be a member of the
 * organisation specified by :orgId, with one of the allowed roles.
 */
export function requireOrgRole(...allowedRoles: OrgRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const orgId = param(req, 'orgId');
    if (!orgId) {
      res.status(400).json({ error: 'Organisation ID is required' });
      return;
    }

    const membership = await prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: req.user.id, orgId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'You are not a member of this organisation' });
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      res.status(403).json({ error: 'Insufficient permissions for this action' });
      return;
    }

    req.orgContext = { orgId, role: membership.role };
    next();
  };
}

/**
 * Middleware: Require the user to be a {{PROJECT_NAME}} staff member.
 */
export function requireStaff(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (!req.user.isStaff) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  next();
}
