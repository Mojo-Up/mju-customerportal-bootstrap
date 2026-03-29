import { z } from 'zod';

/** Environment code format: XXXX-XXXX-XXXX-XXXX (hex characters, uppercase) */
const ENV_CODE_REGEX = /^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$/;

export const environmentCodeSchema = z
  .string()
  .regex(ENV_CODE_REGEX, 'Environment code must be in format XXXX-XXXX-XXXX-XXXX (hex)');

export const createEnvironmentSchema = z.object({
  environmentCode: environmentCodeSchema,
  name: z.string().max(100).optional(),
});

export const activateEnvironmentSchema = z.object({
  environmentCode: environmentCodeSchema,
});

export const createOrgSchema = z.object({
  name: z.string().min(1).max(200),
});

export const updateOrgSchema = z.object({
  name: z.string().min(1).max(200),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(['owner', 'admin', 'billing', 'technical']),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['owner', 'admin', 'billing', 'technical']),
});

export const createCheckoutSessionSchema = z.object({
  productId: z.string().uuid(),
  pricingPlanId: z.string().uuid(),
});

export const createTicketSchema = z.object({
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(10000),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  productId: z.string().uuid().optional(),
});

export const createTicketMessageSchema = z.object({
  body: z.string().min(1).max(10000),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().min(1).max(5000),
  iconUrl: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  features: z.array(z.string()).optional(),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(5000).optional(),
  iconUrl: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  features: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const createPricingPlanSchema = z.object({
  name: z.string().min(1).max(100),
  stripePriceId: z.string().min(1),
  interval: z.enum(['month', 'year']),
  price: z.number().int().min(0),
  currency: z.string().length(3).default('aud'),
  features: z.array(z.string()).optional(),
});

export const updatePricingPlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  stripePriceId: z.string().min(1).optional(),
  interval: z.enum(['month', 'year']).optional(),
  price: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  features: z.array(z.string()).optional(),
  sortOrder: z.number().int().optional(),
});

export const createTicketMessageWithInternalSchema = z.object({
  body: z.string().min(1).max(10000),
  isInternal: z.boolean().optional(),
});
