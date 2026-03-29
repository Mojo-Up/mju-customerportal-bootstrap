export const DEFAULT_MAX_ENVIRONMENTS = 5;
export const TRIAL_DAYS = 30;
export const SUBSCRIPTION_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const SUBSCRIPTION_API_TIMEOUT_MS = 10_000; // 10 seconds

export const API_BASE_URL = 'https://api.{{DOMAIN}}';
export const PORTAL_BASE_URL = 'https://portal.{{DOMAIN}}';
export const MCP_BASE_URL = 'https://mcp.{{DOMAIN}}';

/** CORS origins for the public subscription status API (Power Apps domains) */
export const PUBLIC_API_CORS_ORIGINS = [/\.powerapps\.com$/, /\.dynamics\.com$/];

/** Rate limit for subscription status endpoint (requests per day per subscription) */
export const SUBSCRIPTION_STATUS_RATE_LIMIT = 100;
