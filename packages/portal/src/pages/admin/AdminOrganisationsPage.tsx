import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/client';

interface OrgItem {
  id: string;
  customerId: number;
  name: string;
  createdAt: string;
  _count: { memberships: number; subscriptions: number; licences: number };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export function AdminOrganisationsPage() {
  const { apiFetch } = useApi();
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Create org form
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createOwnerEmail, setCreateOwnerEmail] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchOrgs = (page = 1, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (q) params.set('search', q);
    apiFetch<{ data: OrgItem[]; pagination: Pagination }>(`/api/admin/organisations?${params}`)
      .then((r) => {
        setOrgs(r.data);
        setPagination(r.pagination);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrgs();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrgs(1, search);
  };

  const handleCreateOrg = async () => {
    if (!createName) return;
    setCreateError(null);
    try {
      await apiFetch('/api/admin/organisations', {
        method: 'POST',
        body: { name: createName, ownerEmail: createOwnerEmail || undefined },
      });
      setShowCreate(false);
      setCreateName('');
      setCreateOwnerEmail('');
      fetchOrgs();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create organisation');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organisations</h1>
          <Link to="/admin" className="text-sm text-teal hover:text-teal-dark">
            &larr; Admin Dashboard
          </Link>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
        >
          {showCreate ? 'Cancel' : 'Create Organisation'}
        </button>
      </div>

      {showCreate && (
        <div className="mt-4 rounded-lg border border-teal/30 bg-teal/10 p-4">
          <h3 className="text-sm font-semibold text-teal-dark">Create Organisation</h3>
          {createError && <p className="mt-2 text-sm text-red-600">{createError}</p>}
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              type="text"
              placeholder="Organisation name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="email"
              placeholder="Owner email (optional)"
              value={createOwnerEmail}
              onChange={(e) => setCreateOwnerEmail(e.target.value)}
              className="flex-1 min-w-[200px] rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleCreateOrg}
              disabled={!createName}
              className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Create
            </button>
          </div>
          <p className="mt-2 text-xs text-teal-dark">
            If an owner email is provided, the user must already have a portal account.
          </p>
        </div>
      )}

      <form onSubmit={handleSearch} className="mt-6 flex gap-3">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Search
        </button>
      </form>

      {loading ? (
        <div className="py-20 text-center text-gray-500">Loading...</div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Customer ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Subscriptions
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Licences
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">
                      CUST-{String(org.customerId).padStart(4, '0')}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/organisations/${org.id}`}
                        className="font-medium text-teal hover:text-teal-dark"
                      >
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{org._count.memberships}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{org._count.subscriptions}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{org._count.licences}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(org.createdAt).toLocaleDateString('en-AU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orgs.length === 0 && (
            <p className="mt-4 text-center text-gray-500">No organisations found.</p>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Page {pagination.page} of {totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchOrgs(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded bg-gray-100 px-3 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchOrgs(pagination.page + 1)}
                  disabled={pagination.page >= totalPages}
                  className="rounded bg-gray-100 px-3 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
