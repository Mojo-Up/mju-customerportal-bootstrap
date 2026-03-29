import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../api/client';

interface OrgDetail {
  id: string;
  customerId: number;
  name: string;
  stripeCustomerId: string | null;
  createdAt: string;
  memberships: {
    userId: string;
    role: string;
    user: { id: string; email: string; name: string };
  }[];
  subscriptions: {
    id: string;
    plan: string;
    status: string;
    startDate: string;
    endDate: string;
    stripeSubscriptionId: string | null;
    product: { id: string; name: string };
  }[];
  licences: {
    id: string;
    type: string;
    expiryDate: string | null;
    maxEnvironments: number;
    product: { id: string; name: string };
    subscription: { id: string; endDate: string } | null;
    environments: {
      id: string;
      name: string;
      environmentCode: string;
      activatedAt: string | null;
    }[];
    _count: { environments: number };
  }[];
  _count: { tickets: number };
}

interface ProductItem {
  id: string;
  name: string;
  isActive: boolean;
}

export function AdminOrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { apiFetch } = useApi();
  const [org, setOrg] = useState<OrgDetail | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Licence form
  const [showLicenceForm, setShowLicenceForm] = useState(false);
  const [licProductId, setLicProductId] = useState('');
  const [licType, setLicType] = useState<'time_limited' | 'unlimited'>('time_limited');
  const [licExpiry, setLicExpiry] = useState('');
  const [licMaxEnvs, setLicMaxEnvs] = useState('5');

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('technical');

  // Licence/env management
  const [expandedLicence, setExpandedLicence] = useState<string | null>(null);
  const [editingMaxEnvs, setEditingMaxEnvs] = useState<Record<string, string>>({});
  const [activationCodes, setActivationCodes] = useState<Record<string, string>>({});

  const loadOrg = () => {
    if (!orgId) return;
    apiFetch<OrgDetail>(`/api/admin/organisations/${orgId}`)
      .then(setOrg)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadOrg();
    apiFetch<ProductItem[]>('/api/admin/products')
      .then((p) => setProducts(p.filter((x) => x.isActive)))
      .catch(console.error);
  }, [orgId]);

  const handleAssignLicence = async () => {
    if (!orgId || !licProductId) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/admin/organisations/${orgId}/licences`, {
        method: 'POST',
        body: {
          productId: licProductId,
          type: licType,
          expiryDate: licType === 'time_limited' ? licExpiry : undefined,
          maxEnvironments: parseInt(licMaxEnvs, 10),
        },
      });
      setSuccess('Licence assigned successfully');
      setShowLicenceForm(false);
      setLicProductId('');
      setLicExpiry('');
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign licence');
    }
  };

  const handleAddMember = async () => {
    if (!orgId || !addEmail) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/admin/organisations/${orgId}/members`, {
        method: 'POST',
        body: { email: addEmail, role: addRole },
      });
      setSuccess('Member added successfully');
      setShowAddMember(false);
      setAddEmail('');
      setAddRole('technical');
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!orgId) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/admin/organisations/${orgId}/members/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      setSuccess('Role updated');
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!orgId) return;
    if (!window.confirm(`Remove ${name} from this organisation?`)) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/admin/organisations/${orgId}/members/${userId}`, {
        method: 'DELETE',
      });
      setSuccess('Member removed');
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleUpdateMaxEnvs = async (licenceId: string) => {
    const val = parseInt(editingMaxEnvs[licenceId], 10);
    if (!val || val < 1) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/admin/licences/${licenceId}/max-environments`, {
        method: 'PATCH',
        body: { maxEnvironments: val },
      });
      setSuccess(`Environment limit updated to ${val}`);
      setEditingMaxEnvs((prev) => {
        const n = { ...prev };
        delete n[licenceId];
        return n;
      });
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update environment limit');
    }
  };

  const handleActivate = async (licenceId: string, envId: string) => {
    if (!orgId) return;
    setError(null);
    setSuccess(null);
    try {
      const result = await apiFetch<{ activationCode: string }>(
        `/api/admin/organisations/${orgId}/licences/${licenceId}/environments/${envId}/activate`,
        { method: 'POST' },
      );
      setActivationCodes((prev) => ({ ...prev, [envId]: result.activationCode }));
      setSuccess('Activation code generated');
      loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate activation code');
    }
  };

  if (loading) return <div className="py-20 text-center text-gray-500">Loading...</div>;
  if (!org) return <div className="py-20 text-center text-gray-500">Organisation not found.</div>;

  const roleColour: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-teal/15 text-teal-dark',
    billing: 'bg-green-100 text-green-700',
    technical: 'bg-orange-100 text-orange-700',
  };

  const statusColour: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    past_due: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {org.name}{' '}
          <span className="text-sm font-mono text-gray-500">
            CUST-{String(org.customerId).padStart(4, '0')}
          </span>
        </h1>
        <Link to="/admin/organisations" className="text-sm text-teal hover:text-teal-dark">
          &larr; All Organisations
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {/* Members */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Members ({org.memberships.length})</h2>
        <button
          onClick={() => setShowAddMember(!showAddMember)}
          className="rounded bg-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-dark"
        >
          {showAddMember ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {showAddMember && (
        <div className="mt-4 rounded-lg border border-teal/30 bg-teal/10 p-4">
          <h3 className="text-sm font-semibold text-teal-dark">Add Member</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="Email address"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
            </select>
            <button
              onClick={handleAddMember}
              disabled={!addEmail}
              className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <p className="mt-2 text-xs text-teal-dark">User must already have a portal account.</p>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {org.memberships.map((m) => (
          <div
            key={m.userId}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2"
          >
            <div>
              <p className="text-sm font-medium">{m.user.name}</p>
              <p className="text-xs text-gray-500">{m.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={m.role}
                onChange={(e) => handleChangeRole(m.userId, e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="owner">Owner</option>
                <option value="admin">Admin</option>
                <option value="billing">Billing</option>
                <option value="technical">Technical</option>
              </select>
              {m.role !== 'owner' && (
                <button
                  onClick={() => handleRemoveMember(m.userId, m.user.name)}
                  className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Subscriptions */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">
        Subscriptions ({org.subscriptions.length})
      </h2>
      {org.subscriptions.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No subscriptions.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {org.subscriptions.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">
                  {s.product.name} — <span className="capitalize">{s.plan}</span>
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(s.startDate).toLocaleDateString('en-AU')} –{' '}
                  {new Date(s.endDate).toLocaleDateString('en-AU')}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColour[s.status] || ''}`}
              >
                {s.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Licences */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Licences ({org.licences.length})</h2>
        <button
          onClick={() => setShowLicenceForm(!showLicenceForm)}
          className="rounded bg-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-dark"
        >
          {showLicenceForm ? 'Cancel' : 'Assign Licence'}
        </button>
      </div>

      {showLicenceForm && (
        <div className="mt-4 rounded-lg border border-teal/30 bg-teal/10 p-4">
          <h3 className="text-sm font-semibold text-teal-dark">Assign Licence</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={licProductId}
              onChange={(e) => setLicProductId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Select Product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={licType}
              onChange={(e) => setLicType(e.target.value as 'time_limited' | 'unlimited')}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="time_limited">Time Limited</option>
              <option value="unlimited">Perpetual / Unlimited</option>
            </select>
            {licType === 'time_limited' && (
              <input
                type="date"
                value={licExpiry}
                onChange={(e) => setLicExpiry(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            )}
            <input
              type="number"
              value={licMaxEnvs}
              onChange={(e) => setLicMaxEnvs(e.target.value)}
              min="1"
              placeholder="Max envs"
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleAssignLicence}
            disabled={!licProductId || (licType === 'time_limited' && !licExpiry)}
            className="mt-3 rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
          >
            Assign
          </button>
        </div>
      )}

      {org.licences.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No licences.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {org.licences.map((l) => {
            const isExpanded = expandedLicence === l.id;
            return (
              <div key={l.id} className="rounded-lg border border-gray-200 bg-white">
                <div
                  className="flex cursor-pointer items-center justify-between px-4 py-3 hover:bg-gray-50"
                  onClick={() => setExpandedLicence(isExpanded ? null : l.id)}
                >
                  <div>
                    <p className="text-sm font-medium">
                      {l.product.name} —{' '}
                      <span className="capitalize">{l.type.replace('_', ' ')}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Environments: {l._count.environments} / {l.maxEnvironments}
                      {l.expiryDate && (
                        <> — Expires: {new Date(l.expiryDate).toLocaleDateString('en-AU')}</>
                      )}
                    </p>
                  </div>
                  <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {/* Max environments editor */}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Environment limit:</span>
                      <input
                        type="number"
                        min="1"
                        value={editingMaxEnvs[l.id] ?? String(l.maxEnvironments)}
                        onChange={(e) =>
                          setEditingMaxEnvs((prev) => ({ ...prev, [l.id]: e.target.value }))
                        }
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                      />
                      {editingMaxEnvs[l.id] &&
                        editingMaxEnvs[l.id] !== String(l.maxEnvironments) && (
                          <button
                            onClick={() => handleUpdateMaxEnvs(l.id)}
                            className="rounded bg-teal px-3 py-1 text-xs font-medium text-white hover:bg-teal-dark"
                          >
                            Save
                          </button>
                        )}
                    </div>

                    {/* Environments list */}
                    {l.environments.length === 0 ? (
                      <p className="mt-3 text-xs text-gray-400">No environments registered.</p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {l.environments.map((env) => (
                          <div
                            key={env.id}
                            className="rounded border border-gray-100 bg-gray-50 px-3 py-2"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">{env.name}</p>
                                <p className="font-mono text-xs text-gray-500">
                                  {env.environmentCode}
                                </p>
                                {env.activatedAt && (
                                  <p className="text-xs text-gray-400">
                                    Last activated:{' '}
                                    {new Date(env.activatedAt).toLocaleDateString('en-AU')}
                                  </p>
                                )}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivate(l.id, env.id);
                                }}
                                className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                              >
                                Generate Code
                              </button>
                            </div>
                            {activationCodes[env.id] && (
                              <div className="mt-2 rounded bg-green-50 border border-green-200 p-2">
                                <p className="text-xs font-medium text-green-800">
                                  Activation Code:
                                </p>
                                <p className="mt-1 break-all font-mono text-xs text-green-900 select-all">
                                  {activationCodes[env.id]}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Stats */}
      <p className="mt-8 text-sm text-gray-500">
        Open tickets: {org._count.tickets} | Stripe Customer: {org.stripeCustomerId || 'None'}
      </p>

      {/* Danger Zone */}
      <div className="mt-10 rounded-lg border border-red-200 bg-red-50 p-4">
        <h2 className="text-sm font-semibold text-red-900">Danger Zone</h2>
        <p className="mt-1 text-xs text-red-700">
          Permanently delete this organisation and all associated data (members, licences,
          environments, tickets). Active subscriptions must be cancelled first.
        </p>
        <button
          onClick={async () => {
            if (
              !window.confirm(
                `Delete organisation "${org.name}"? This will permanently remove all data including licences, environments, members, and tickets. This cannot be undone.`,
              )
            )
              return;
            setError(null);
            try {
              await apiFetch(`/api/admin/organisations/${orgId}`, { method: 'DELETE' });
              navigate('/admin/organisations');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to delete organisation');
            }
          }}
          className="mt-3 rounded bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
        >
          Delete Organisation
        </button>
      </div>
    </div>
  );
}
