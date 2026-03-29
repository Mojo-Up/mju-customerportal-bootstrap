import { createHmac, timingSafeEqual } from 'node:crypto';
import { LicenceType } from '@{{ORG_SCOPE}}/shared';

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Normalise an environment code (XXXX-XXXX-XXXX-XXXX) to a 16-char hex fingerprint.
 */
export function normaliseFingerprint(environmentCode: string): string {
  return environmentCode.replace(/-/g, '').toLowerCase();
}

/**
 * Validate that an environment code is in the correct format.
 */
export function isValidEnvironmentCode(code: string): boolean {
  return /^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$/.test(code);
}

interface GenerateActivationCodeParams {
  environmentCode: string;
  licenceType: LicenceType;
  hmacKey: string;
  subscriptionId?: string;
  endDate?: Date;
}

/**
 * Generate an HMAC-SHA256 signed activation code.
 *
 * Format: Base64URL(payload).Base64URL(HMAC-SHA256-signature)
 *
 * Payload formats:
 * - Subscription:  {fingerprint}|100000003|{subscriptionId}|{endDateISO}
 * - TimeLimited:   {fingerprint}|100000001|{expiryDateISO}
 * - Unlimited:     {fingerprint}|100000002|unlimited
 */
export function generateActivationCode(params: GenerateActivationCodeParams): string {
  const { environmentCode, licenceType, hmacKey, subscriptionId, endDate } = params;

  const fingerprint = normaliseFingerprint(environmentCode);
  if (fingerprint.length !== 16 || !/^[0-9a-f]+$/.test(fingerprint)) {
    throw new Error('Invalid environment code format');
  }

  let payload: string;

  switch (licenceType) {
    case LicenceType.Subscription: {
      if (!subscriptionId) throw new Error('subscriptionId required for subscription licences');
      if (!endDate) throw new Error('endDate required for subscription licences');
      const endDateCopy = new Date(endDate);
      endDateCopy.setUTCHours(23, 59, 59, 0);
      payload = `${fingerprint}|${licenceType}|${subscriptionId}|${endDateCopy.toISOString()}`;
      break;
    }
    case LicenceType.TimeLimited: {
      if (!endDate) throw new Error('endDate required for time-limited licences');
      payload = `${fingerprint}|${licenceType}|${endDate.toISOString()}`;
      break;
    }
    case LicenceType.Unlimited: {
      payload = `${fingerprint}|${licenceType}|unlimited`;
      break;
    }
    default:
      throw new Error(`Unsupported licence type: ${licenceType}`);
  }

  const payloadBytes = Buffer.from(payload, 'utf-8');
  const hmac = createHmac('sha256', hmacKey);
  hmac.update(payloadBytes);
  const signature = hmac.digest();

  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(signature)}`;
}

function base64UrlDecode(str: string): Buffer {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

export interface VerifiedActivationCode {
  fingerprint: string;
  licenceType: LicenceType;
  subscriptionId?: string;
  endDate?: Date;
}

/**
 * Verify an HMAC-SHA256 signed activation code and extract its payload.
 * Returns null if the signature is invalid.
 */
export function verifyActivationCode(
  activationCode: string,
  hmacKey: string,
): VerifiedActivationCode | null {
  const parts = activationCode.split('.');
  if (parts.length !== 2) return null;

  const payloadBytes = base64UrlDecode(parts[0]);
  const signatureBytes = base64UrlDecode(parts[1]);

  // Verify HMAC (constant-time comparison)
  const hmac = createHmac('sha256', hmacKey);
  hmac.update(payloadBytes);
  const expected = hmac.digest();

  if (expected.length !== signatureBytes.length || !timingSafeEqual(expected, signatureBytes))
    return null;

  const payload = payloadBytes.toString('utf-8');
  const segments = payload.split('|');
  if (segments.length < 3) return null;

  const fingerprint = segments[0];
  const licenceType = parseInt(segments[1], 10) as LicenceType;

  switch (licenceType) {
    case LicenceType.Subscription: {
      if (segments.length < 4) return null;
      return {
        fingerprint,
        licenceType,
        subscriptionId: segments[2],
        endDate: new Date(segments[3]),
      };
    }
    case LicenceType.TimeLimited: {
      return {
        fingerprint,
        licenceType,
        endDate: new Date(segments[2]),
      };
    }
    case LicenceType.Unlimited: {
      return { fingerprint, licenceType };
    }
    default:
      return null;
  }
}
