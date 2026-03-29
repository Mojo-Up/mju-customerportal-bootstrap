import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../api/client';
import { useOrg } from '../contexts/OrgContext';
import { getPendingPurchase, clearPendingPurchase } from '../lib/pendingPurchase';
import { isSafeRedirectUrl } from '../api/client';

/**
 * PostLoginRouter handles the redirect after a user signs in via a "Subscribe"
 * button on a public product page.
 *
 * Flow:
 * 1. User is now authenticated
 * 2. OrgProvider has loaded their organisations
 * 3. If the user has NO org → send to /onboarding (which also handles pending purchase)
 * 4. If the user HAS an org AND a pending purchase → create checkout session → redirect to Stripe
 * 5. If the user HAS an org but no pending purchase → send to /dashboard
 */
export function PostLoginRouter() {
  const navigate = useNavigate();
  const { apiFetch } = useApi();
  const { currentOrg, loading: orgLoading } = useOrg();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (orgLoading) return;

    const pending = getPendingPurchase();

    if (!currentOrg) {
      // No org — onboarding will handle creating one and processing the pending purchase
      navigate('/onboarding', { replace: true });
      return;
    }

    if (!pending) {
      // No pending purchase and has an org — go to dashboard
      navigate('/dashboard', { replace: true });
      return;
    }

    // Has org + pending purchase — create checkout session
    setProcessing(true);
    apiFetch<{ url: string }>(`/api/organisations/${currentOrg.id}/billing/checkout-session`, {
      method: 'POST',
      body: { productId: pending.productId, pricingPlanId: pending.pricingPlanId },
    })
      .then(({ url }) => {
        clearPendingPurchase();
        if (url && isSafeRedirectUrl(url, ['stripe.com'])) {
          window.location.href = url;
        } else {
          navigate('/dashboard', { replace: true });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to create checkout session');
        setProcessing(false);
      });
  }, [orgLoading, currentOrg]);

  if (orgLoading || processing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-teal border-t-transparent" />
          <p className="mt-4 text-gray-600">
            {processing ? 'Setting up your subscription...' : 'Loading your account...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => navigate('/dashboard', { replace: true })}
            className="mt-4 rounded-lg bg-teal px-6 py-2 text-sm font-medium text-white hover:bg-teal-dark"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
