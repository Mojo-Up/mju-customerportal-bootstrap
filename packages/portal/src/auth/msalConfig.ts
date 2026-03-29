import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const tenant = import.meta.env.VITE_ENTRA_EXTERNAL_ID_TENANT || '{{ENTRA_CIAM_TENANT}}';
const clientId = import.meta.env.VITE_ENTRA_EXTERNAL_ID_CLIENT_ID || '';

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://${tenant}.ciamlogin.com/`,
    knownAuthorities: [`${tenant}.ciamlogin.com`],
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: [`api://${clientId}/access`],
};
