import { useEffect, useState } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { useApi, isSafeRedirectUrl } from '../api/client';

interface LicenceItem {
  id: string;
  type: string;
  productName: string;
  subscription: {
    id: string;
    plan: string;
    status: string;
    startDate: string;
    endDate: string;
  } | null;
  expiryDate: string | null;
  maxEnvironments: number;
  environmentCount: number;
  createdAt: string;
}

interface EnvironmentItem {
  id: string;
  environmentCode: string;
  name: string | null;
  activatedAt: string | null;
  lastCheckIn: string | null;
  createdAt: string;
}

export function LicencesPage() {
  const { currentOrg } = useOrg();
  const { apiFetch } = useApi();
  const [licences, setLicences] = useState<LicenceItem[]>([]);
  const [selectedLicence, setSelectedLicence] = useState<LicenceItem | null>(null);
  const [environments, setEnvironments] = useState<EnvironmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activationCode, setActivationCode] = useState<string | null>(null);
  const [newEnvCode, setNewEnvCode] = useState('');
  const [newEnvName, setNewEnvName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadEnvironments = async (licenceId: string) => {
    if (!currentOrg) return;
    const envs = await apiFetch<EnvironmentItem[]>(
      `/api/organisations/${currentOrg.id}/licences/${licenceId}/environments`,
    );
    setEnvironments(envs);
  };

  useEffect(() => {
    if (!currentOrg) return;
    apiFetch<LicenceItem[]>(`/api/organisations/${currentOrg.id}/licences`)
      .then((data) => {
        setLicences(data);
        if (data.length > 0) setSelectedLicence(data[0]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  useEffect(() => {
    if (!currentOrg || !selectedLicence) return;
    loadEnvironments(selectedLicence.id).catch(console.error);
  }, [selectedLicence?.id]);

  const handleAddEnvironment = async () => {
    if (!currentOrg || !selectedLicence) return;
    setError(null);
    try {
      await apiFetch(
        `/api/organisations/${currentOrg.id}/licences/${selectedLicence.id}/environments`,
        {
          method: 'POST',
          body: { environmentCode: newEnvCode.toUpperCase(), name: newEnvName || undefined },
        },
      );
      setNewEnvCode('');
      setNewEnvName('');
      // Refresh
      await loadEnvironments(selectedLicence.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add environment');
    }
  };

  const handleActivate = async (envId: string) => {
    if (!currentOrg || !selectedLicence) return;
    setError(null);
    setActivationCode(null);
    try {
      const result = await apiFetch<{ activationCode: string }>(
        `/api/organisations/${currentOrg.id}/licences/${selectedLicence.id}/environments/${envId}/activate`,
        { method: 'POST' },
      );
      setActivationCode(result.activationCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate activation code');
    }
  };

  const handleRemoveEnvironment = async (envId: string) => {
    if (!currentOrg || !selectedLicence) return;
    if (!window.confirm('Remove this environment? Any activation codes will stop working.')) return;
    setError(null);
    try {
      await apiFetch(
        `/api/organisations/${currentOrg.id}/licences/${selectedLicence.id}/environments/${envId}`,
        { method: 'DELETE' },
      );
      await loadEnvironments(selectedLicence.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove environment');
    }
  };

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
      setError('No billing account found. Subscribe to a plan first.');
    }
  };

  if (!currentOrg) return <p className="text-gray-500">Select an organisation first.</p>;
  if (loading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Licences &amp; Environments</h1>

      {licences.length === 0 ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">No licences found. Subscribe to a plan to get started.</p>
        </div>
      ) : (
        <>
          {/* Licence selector */}
          {licences.length > 1 && (
            <div className="mt-4">
              <select
                value={selectedLicence?.id || ''}
                onChange={(e) =>
                  setSelectedLicence(licences.find((l) => l.id === e.target.value) || null)
                }
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {licences.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.productName} — {l.type.replace('_', ' ')} (
                    {l.subscription?.status || 'active'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedLicence && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <p className="text-xs text-gray-500">Product</p>
                  <p className="font-medium">{selectedLicence.productName}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Type</p>
                  <p className="font-medium capitalize">
                    {selectedLicence.type.replace('_', ' ')}
                    {selectedLicence.subscription && (
                      <span className="ml-1 text-gray-500">
                        ({selectedLicence.subscription.plan})
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Status</p>
                  <p className="font-medium capitalize">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        (selectedLicence.subscription?.status || 'active') === 'active'
                          ? 'bg-green-100 text-green-700'
                          : selectedLicence.subscription?.status === 'past_due'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {selectedLicence.subscription?.status || 'Active'}
                    </span>
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">End Date</p>
                  <p className="font-medium">
                    {selectedLicence.subscription?.endDate
                      ? new Date(selectedLicence.subscription.endDate).toLocaleDateString('en-AU')
                      : selectedLicence.expiryDate
                        ? new Date(selectedLicence.expiryDate).toLocaleDateString('en-AU')
                        : 'Unlimited'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Environments</p>
                  <p className="font-medium">
                    {selectedLicence.environmentCount} / {selectedLicence.maxEnvironments}
                  </p>
                </div>
              </div>

              {/* Subscription actions */}
              {selectedLicence.subscription && (
                <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-4">
                  {selectedLicence.subscription.status === 'past_due' && (
                    <p className="text-sm text-yellow-700">
                      ⚠ Payment failed. Please update your payment method to avoid service
                      interruption.
                    </p>
                  )}
                  {selectedLicence.subscription.status === 'cancelled' && (
                    <p className="text-sm text-red-600">
                      This subscription has been cancelled. You can reactivate it from the billing
                      portal.
                    </p>
                  )}
                  <button
                    onClick={handleManageBilling}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {selectedLicence.subscription.status === 'past_due'
                      ? 'Update Payment Method'
                      : selectedLicence.subscription.status === 'cancelled'
                        ? 'Reactivate Subscription'
                        : 'Manage Subscription'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Environments */}
          <h2 className="mt-8 text-lg font-semibold text-gray-900">Environments</h2>

          {error && (
            <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Activation code display */}
          {activationCode && (
            <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm font-semibold text-green-800">Activation Code Generated</p>
              <p className="mt-1 text-xs text-green-700">
                Copy this code and paste it into your product's Settings &rarr; Activation Code
              </p>
              <div className="mt-2 flex items-center gap-2">
                <code className="block rounded bg-white px-3 py-2 text-xs font-mono break-all border border-green-300 flex-1">
                  {activationCode}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(activationCode)}
                  className="rounded bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {environments.map((env) => (
              <div
                key={env.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-mono text-sm font-medium">{env.environmentCode}</p>
                  <p className="text-xs text-gray-500">
                    {env.name || 'Unnamed'} —{' '}
                    {env.activatedAt
                      ? `Activated ${new Date(env.activatedAt).toLocaleDateString('en-AU')}`
                      : 'Not activated'}
                  </p>
                  {env.lastCheckIn && (
                    <p className="text-xs text-gray-400">
                      Last check-in:{' '}
                      {new Date(env.lastCheckIn).toLocaleString('en-AU', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleActivate(env.id)}
                    className="rounded bg-teal px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-dark"
                  >
                    Generate Code
                  </button>
                  <button
                    onClick={() => handleRemoveEnvironment(env.id)}
                    className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add environment */}
          <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Add Environment</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={newEnvCode}
                onChange={(e) => setNewEnvCode(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm font-mono w-52"
              />
              <input
                type="text"
                placeholder="Name (e.g. Production)"
                value={newEnvName}
                onChange={(e) => setNewEnvName(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm w-48"
              />
              <button
                onClick={handleAddEnvironment}
                disabled={!newEnvCode}
                className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
