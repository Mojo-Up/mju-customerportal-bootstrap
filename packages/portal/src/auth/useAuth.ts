import { useMsal } from '@azure/msal-react';
import { loginRequest } from './msalConfig';

export function useAuth() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const getAccessToken = async (): Promise<string> => {
    if (!account) throw new Error('No active account');

    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return response.accessToken;
  };

  const login = () => instance.loginRedirect(loginRequest);
  const logout = () => instance.logoutRedirect();

  return {
    isAuthenticated: !!account,
    account,
    user: account
      ? {
          name: account.name || 'User',
          email: (() => {
            const claims = account.idTokenClaims as Record<string, unknown> | undefined;
            return (
              (claims?.emails as string[] | undefined)?.[0] ||
              (claims?.email as string | undefined) ||
              (claims?.preferred_username as string | undefined) ||
              account.username
            );
          })(),
        }
      : null,
    getAccessToken,
    login,
    logout,
  };
}
