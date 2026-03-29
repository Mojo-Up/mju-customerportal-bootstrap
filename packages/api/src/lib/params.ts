import { Request } from 'express';

/**
 * Extract a route parameter as a string.
 * Express 5 types params as `string | string[]`; our routes always use named params (string).
 */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}
