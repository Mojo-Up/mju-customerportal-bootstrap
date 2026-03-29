function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '3001'), 10),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isProduction: process.env.NODE_ENV === 'production',

  // Microsoft Entra External ID (CIAM)
  entraExternalId: {
    tenantSubdomain: requireEnv('ENTRA_EXTERNAL_ID_TENANT'),
    tenantId: requireEnv('ENTRA_EXTERNAL_ID_TENANT_ID'),
    clientId: requireEnv('ENTRA_EXTERNAL_ID_CLIENT_ID'),
    get issuer() {
      return `https://${config.entraExternalId.tenantId}.ciamlogin.com/${config.entraExternalId.tenantId}/v2.0`;
    },
    get jwksUri() {
      return `https://${config.entraExternalId.tenantSubdomain}.ciamlogin.com/${config.entraExternalId.tenantId}/discovery/v2.0/keys`;
    },
  },

  // Stripe
  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET'),
  },

  // Activation
  activationHmacKey: requireEnv('ACTIVATION_HMAC_KEY'),

  // Azure Storage
  azureStorage: {
    connectionString: optionalEnv('AZURE_STORAGE_CONNECTION_STRING', ''),
    containerName: optionalEnv('AZURE_STORAGE_CONTAINER_NAME', 'downloads'),
  },

  // URLs
  portalUrl: optionalEnv('PORTAL_URL', 'http://localhost:5173'),
  apiUrl: optionalEnv('API_URL', 'http://localhost:3001'),
} as const;
