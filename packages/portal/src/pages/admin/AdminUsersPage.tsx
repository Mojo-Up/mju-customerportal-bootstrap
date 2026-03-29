import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/client';

interface UserItem {
  id: string;
  name: string;
  email: string;
  isStaff: boolean;
  createdAt: string;
  _count: { memberships: number };
  memberships: { role: string; org: { id: string; name: string; customerId: number } }[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export function AdminUsersPage() {
  const { apiFetch } = useApi();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0 });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchUsers = (page = 1, q = search) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: '20' });
    if (q) params.set('search', q);
    apiFetch<{ data: UserItem[]; pagination: Pagination }>(`/api/admin/users?${params}`)
      .then((r) => {
        setUsers(r.data);
        setPagination(r.pagination);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1, search);
  };

  const handleToggleStaff = async (user: UserItem) => {
    await apiFetch(`/api/admin/users/${user.id}/staff`, {
      method: 'PATCH',
      body: { isStaff: !user.isStaff },
    });
    fetchUsers(pagination.page);
  };

  const handleDeleteUser = async (user: UserItem) => {
    const isOwner = user.memberships.some((m) => m.role === 'owner');
    if (isOwner) {
      alert(
        `Cannot delete ${user.name} — they are an owner of an organisation. Transfer ownership first.`,
      );
      return;
    }
    if (!window.confirm(`Delete user "${user.name}" (${user.email})? This cannot be undone.`))
      return;
    try {
      await apiFetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      fetchUsers(pagination.page);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const totalPages = Math.ceil(pagination.total / pagination.limit);

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <Link to="/admin" className="text-sm text-teal hover:text-teal-dark">
          &larr; Admin Dashboard
        </Link>
      </div>

      <form onSubmit={handleSearch} className="mt-6 flex gap-3">
        <input
          type="text"
          placeholder="Search by name or email..."
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
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Orgs
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Staff
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Created
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{user.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {user.memberships.length > 0 ? (
                        <div className="space-y-0.5">
                          {user.memberships.map((m) => (
                            <div key={m.org.id} className="text-xs">
                              <span className="font-mono text-gray-500">
                                CUST-{String(m.org.customerId).padStart(4, '0')}
                              </span>{' '}
                              {m.org.name}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.isStaff ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Staff
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('en-AU')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleToggleStaff(user)}
                          className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
                        >
                          {user.isStaff ? 'Remove Staff' : 'Make Staff'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user)}
                          className="rounded border border-red-300 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {users.length === 0 && <p className="mt-4 text-center text-gray-500">No users found.</p>}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-gray-500">
                Page {pagination.page} of {totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchUsers(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="rounded bg-gray-100 px-3 py-1 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => fetchUsers(pagination.page + 1)}
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
