import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksRsa from 'jwks-rsa';
import { config } from '../lib/config.js';
import { prisma } from '../lib/prisma.js';

const jwksClient = jwksRsa({
  jwksUri: config.entraExternalId.jwksUri,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600_000, // 10 minutes
});

function getSigningKey(header: jwt.JwtHeader): Promise<string> {
  return new Promise((resolve, reject) => {
    jwksClient.getSigningKey(header.kid, (err, key) => {
      if (err) return reject(err);
      resolve(key!.getPublicKey());
    });
  });
}

export interface AuthenticatedUser {
  id: string; // our DB user ID
  email: string;
  name: string;
  entraObjectId: string;
  isStaff: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware: Validate Entra External ID JWT and attach user to request.
 * Creates user record on first login (JIT provisioning).
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const signingKey = await getSigningKey(decoded.header);
    const payload = jwt.verify(token, signingKey, {
      issuer: config.entraExternalId.issuer,
      audience: [`api://${config.entraExternalId.clientId}`, config.entraExternalId.clientId],
      algorithms: ['RS256'],
    }) as jwt.JwtPayload;

    const entraObjectId = payload.sub || payload.oid;
    const email = (payload.emails?.[0] ||
      payload.email ||
      payload.preferred_username ||
      '') as string;
    const name = (payload.name || payload.given_name || email.split('@')[0] || 'User') as string;

    if (!entraObjectId || !email) {
      res.status(401).json({ error: 'Token missing required claims (sub/oid, email)' });
      return;
    }

    // JIT provisioning: find or create user
    let user = await prisma.user.findUnique({
      where: { entraObjectId },
    });

    if (!user) {
      user = await prisma.user.upsert({
        where: { email },
        update: { entraObjectId, name },
        create: { email, name, entraObjectId },
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      entraObjectId: user.entraObjectId!,
      isStaff: user.isStaff,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expired' });
      return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    next(err);
  }
}
