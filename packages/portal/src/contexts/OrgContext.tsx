import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useApi } from '../api/client';
import { useAuth } from '../auth/useAuth';

interface OrgInfo {
  id: string;
  customerId: string;
  name: string;
  role: string;
  createdAt: string;
}

interface OrgContextType {
  organisations: OrgInfo[];
  currentOrg: OrgInfo | null;
  setCurrentOrg: (org: OrgInfo) => void;
  loading: boolean;
  refetch: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType>({
  organisations: [],
  currentOrg: null,
  setCurrentOrg: () => {},
  loading: true,
  refetch: async () => {},
});

export function OrgProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { apiFetch } = useApi();
  const [organisations, setOrganisations] = useState<OrgInfo[]>([]);
  const [currentOrg, setCurrentOrg] = useState<OrgInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrgs = async () => {
    if (!isAuthenticated) return;
    try {
      const orgs = await apiFetch<OrgInfo[]>('/api/organisations');
      setOrganisations(orgs);
      if (orgs.length > 0 && !currentOrg) {
        // Restore from sessionStorage or default to first
        const savedOrgId = sessionStorage.getItem('currentOrgId');
        const saved = orgs.find((o) => o.id === savedOrgId);
        setCurrentOrg(saved || orgs[0]);
      }
    } catch {
      // Not fatal — user may not have orgs yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrgs();
  }, [isAuthenticated]);

  const handleSetCurrentOrg = (org: OrgInfo) => {
    setCurrentOrg(org);
    sessionStorage.setItem('currentOrgId', org.id);
  };

  return (
    <OrgContext.Provider
      value={{
        organisations,
        currentOrg,
        setCurrentOrg: handleSetCurrentOrg,
        loading,
        refetch: fetchOrgs,
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  return useContext(OrgContext);
}
