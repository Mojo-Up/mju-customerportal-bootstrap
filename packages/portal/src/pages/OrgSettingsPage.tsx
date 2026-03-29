import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOrg } from '../contexts/OrgContext';
import { useApi } from '../api/client';

interface MemberItem {
  userId: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  createdAt: string;
}

export function OrgSettingsPage() {
  const { currentOrg, refetch } = useOrg();
  const { apiFetch } = useApi();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technical');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const navigate = useNavigate();

  const loadMembers = () => {
    if (!currentOrg) return;
    apiFetch<MemberItem[]>(`/api/organisations/${currentOrg.id}/members`)
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const loadInvites = () => {
    if (!currentOrg) return;
    if (currentOrg.role !== 'owner' && currentOrg.role !== 'admin') return;
    apiFetch<PendingInvitation[]>(`/api/organisations/${currentOrg.id}/invitations`)
      .then(setPendingInvites)
      .catch(() => {});
  };

  useEffect(() => {
    loadMembers();
    loadInvites();
  }, [currentOrg?.id]);

  const handleInvite = async () => {
    if (!currentOrg || !inviteEmail) return;
    setError(null);
    setSuccess(null);
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}/invitations`, {
        method: 'POST',
        body: { email: inviteEmail, role: inviteRole },
      });
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
      loadInvites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleCancelInvite = async (invitationId: string, email: string) => {
    if (!currentOrg) return;
    if (!window.confirm(`Cancel invitation for ${email}?`)) return;
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}/invitations/${invitationId}`, {
        method: 'DELETE',
      });
      loadInvites();
      setSuccess('Invitation cancelled');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invitation');
    }
  };

  const handleSaveName = async () => {
    if (!currentOrg || !orgName.trim()) return;
    setNameError(null);
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}`, {
        method: 'PATCH',
        body: { name: orgName.trim() },
      });
      await refetch();
      setEditingName(false);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Failed to update name');
    }
  };

  const handleDeleteOrg = async () => {
    if (!currentOrg || deleteConfirm !== currentOrg.name) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}`, { method: 'DELETE' });
      await refetch();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete organisation');
      setDeleting(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (!currentOrg) return;
    setError(null);
    setSuccess(null);
    if (newRole === 'owner') {
      if (!window.confirm('Transfer ownership? You will become an admin.')) return;
    }
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}/members/${userId}/role`, {
        method: 'PATCH',
        body: { role: newRole },
      });
      if (newRole === 'owner') {
        await refetch();
      }
      loadMembers();
      setSuccess('Role updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change role');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!currentOrg) return;
    if (!window.confirm(`Remove ${name} from this organisation?`)) return;
    setError(null);
    try {
      await apiFetch(`/api/organisations/${currentOrg.id}/members/${userId}`, {
        method: 'DELETE',
      });
      loadMembers();
      setSuccess('Member removed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  if (!currentOrg) return <p className="text-gray-500">Select an organisation first.</p>;

  const roleColour: Record<string, string> = {
    owner: 'bg-purple-100 text-purple-700',
    admin: 'bg-teal/15 text-teal-dark',
    billing: 'bg-green-100 text-green-700',
    technical: 'bg-orange-100 text-orange-700',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Organisation Settings</h1>
      <p className="mt-1 text-sm text-gray-500">
        Customer Number:{' '}
        <span className="font-mono font-medium text-gray-700">{currentOrg.customerId}</span>
        <span className="ml-2 text-xs text-gray-400">— quote this when contacting support</span>
      </p>

      {/* Org Name */}
      <div className="mt-4 flex items-center gap-3">
        {editingName ? (
          <>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium"
              autoFocus
            />
            <button
              onClick={handleSaveName}
              disabled={!orgName.trim()}
              className="rounded bg-teal px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditingName(false)}
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <p className="text-gray-600">{currentOrg.name}</p>
            {currentOrg.role === 'owner' && (
              <button
                onClick={() => {
                  setOrgName(currentOrg.name);
                  setEditingName(true);
                }}
                className="text-sm text-teal hover:text-teal-dark"
              >
                Edit
              </button>
            )}
          </>
        )}
      </div>
      {nameError && <p className="mt-1 text-sm text-red-600">{nameError}</p>}

      {/* Members */}
      <h2 className="mt-8 text-lg font-semibold text-gray-900">Team Members</h2>
      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <div className="mt-4 space-y-3">
          {members.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {currentOrg.role === 'owner' ? (
                  <>
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
                        onClick={() => handleRemoveMember(m.userId, m.name)}
                        className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Remove
                      </button>
                    )}
                  </>
                ) : (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${roleColour[m.role] || ''}`}
                  >
                    {m.role}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite */}
      {(currentOrg.role === 'owner' || currentOrg.role === 'admin') && (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">Invite Team Member</h3>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-2 text-sm text-green-600">{success}</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[200px]"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
            </select>
            <button
              onClick={handleInvite}
              disabled={!inviteEmail}
              className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
            >
              Send Invitation
            </button>
          </div>

          {/* Pending invitations */}
          {pendingInvites.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-700">Pending Invitations</h4>
              <div className="mt-2 space-y-2">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{inv.email}</span>
                      <span className="ml-2 capitalize text-gray-500">{inv.role}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        expires {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => handleCancelInvite(inv.id, inv.email)}
                      className="rounded border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Danger Zone — Delete Organisation */}
      {currentOrg.role === 'owner' && (
        <div className="mt-12 rounded-lg border border-red-200 bg-red-50 p-6">
          <h3 className="font-semibold text-red-900">Danger Zone</h3>
          <p className="mt-2 text-sm text-red-700">
            Permanently delete this organisation and all associated data including subscriptions,
            licences, environments, support tickets, and team memberships. You must cancel all
            active subscriptions first via the Manage Subscription button on the Licences page. This
            action cannot be undone.
          </p>
          <div className="mt-4">
            <p className="text-sm text-red-700">
              Type <strong>{currentOrg.name}</strong> to confirm:
            </p>
            <div className="mt-2 flex gap-3">
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={currentOrg.name}
                className="rounded border border-red-300 px-3 py-2 text-sm w-64"
              />
              <button
                onClick={handleDeleteOrg}
                disabled={deleteConfirm !== currentOrg.name || deleting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Organisation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
