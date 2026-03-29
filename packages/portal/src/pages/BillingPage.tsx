import { Link } from 'react-router-dom';
import { useOrg } from '../contexts/OrgContext';
import { useApi, isSafeRedirectUrl } from '../api/client';

export function BillingPage() {
  const { currentOrg } = useOrg();
  const { apiFetch } = useApi();

  const handleManageBilling = async () => {
    if (!currentOrg) return;
    try {
      const { url } = await apiFetch<{ url: string }>(
        `/api/organisations/${currentOrg.id}/billing/portal-session`,
        { method: 'POST' },
      );
      if (isSafeRedirectUrl(url, ['stripe.com'])) {
        window.location.href = url;
      }
    } catch {
      // No Stripe customer yet
    }
  };

  if (!currentOrg) return <p className="text-gray-500">Select an organisation first.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Billing</h1>
      <p className="mt-1 text-gray-600">
        Manage your subscription and payment details. All billing is handled securely through
        Stripe.
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">New Subscription</h3>
          <p className="mt-2 text-sm text-gray-600">
            Browse products and choose a plan that suits your organisation.
          </p>
          <Link
            to="/products"
            className="mt-4 inline-block rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
          >
            Browse Products
          </Link>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">Manage Billing</h3>
          <p className="mt-2 text-sm text-gray-600">
            Update payment methods, view invoices, or cancel your subscription via Stripe's secure
            billing portal.
          </p>
          <button
            onClick={handleManageBilling}
            className="mt-4 rounded bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Open Billing Portal
          </button>
        </div>
      </div>
    </div>
  );
}
