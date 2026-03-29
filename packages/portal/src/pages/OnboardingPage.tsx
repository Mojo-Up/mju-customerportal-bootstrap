import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, isSafeRedirectUrl } from '../api/client';
import { useOrg } from '../contexts/OrgContext';
import { getPendingPurchase, clearPendingPurchase } from '../lib/pendingPurchase';

export function OnboardingPage() {
  const { apiFetch } = useApi();
  const { refetch } = useOrg();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const pending = getPendingPurchase();

  const handleCreate = async () => {
    if (!orgName.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const org = await apiFetch<{ id: string }>('/api/organisations', {
        method: 'POST',
        body: { name: orgName.trim() },
      });
      await refetch();

      // If there's a pending purchase, create checkout session immediately
      if (pending) {
        try {
          const { url } = await apiFetch<{ url: string }>(
            `/api/organisations/${org.id}/billing/checkout-session`,
            {
              method: 'POST',
              body: { productId: pending.productId, pricingPlanId: pending.pricingPlanId },
            },
          );
          clearPendingPurchase();
          if (url && isSafeRedirectUrl(url, ['stripe.com'])) {
            window.location.href = url;
            return;
          }
        } catch {
          // Checkout failed but org was created — continue to dashboard
          clearPendingPurchase();
        }
      }

      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organisation');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">Welcome to {{PROJECT_NAME}}</h1>
        <p className="mt-2 text-gray-600">
          Create your organisation to get started. You can invite team members later.
        </p>

        {pending && (
          <div className="mt-4 rounded bg-teal/10 border border-teal/30 p-3 text-sm text-teal-dark">
            After creating your organisation, you'll be redirected to complete your subscription
            purchase.
          </div>
        )}

        {error && (
          <div className="mt-4 rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700">Organisation Name</label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="e.g. Contoso Ltd"
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
        </div>

        <button
          onClick={handleCreate}
          disabled={!orgName.trim() || creating}
          className="mt-6 w-full rounded-lg bg-teal py-2.5 text-sm font-semibold text-white hover:bg-teal-dark disabled:opacity-50"
        >
          {creating
            ? pending
              ? 'Creating & setting up subscription...'
              : 'Creating...'
            : pending
              ? 'Create Organisation & Subscribe'
              : 'Create Organisation'}
        </button>
      </div>
    </div>
  );
}
