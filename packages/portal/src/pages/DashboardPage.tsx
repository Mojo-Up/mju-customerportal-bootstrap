import { useEffect, useState } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { useApi } from '../api/client';
import { Link, useNavigate } from 'react-router-dom';

interface OrgDetail {
  id: string;
  name: string;
  role: string;
  stats: {
    memberships: number;
    subscriptions: number;
    licences: number;
    tickets: number;
  };
}

interface PendingInvite {
  id: string;
  orgId: string;
  orgName: string;
  role: string;
  token: string;
  expiresAt: string;
}

export function DashboardPage() {
  const { currentOrg, refetch } = useOrg();
  const { apiFetch } = useApi();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PendingInvite[]>('/api/me/invitations')
      .then(setPendingInvites)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!currentOrg) return;
    apiFetch<OrgDetail>(`/api/organisations/${currentOrg.id}`)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  const handleAcceptInvite = async (token: string) => {
    setAcceptingToken(token);
    try {
      await apiFetch(`/api/organisations/invitations/${token}/accept`, { method: 'POST' });
      setPendingInvites((prev) => prev.filter((i) => i.token !== token));
      await refetch();
    } catch {
      // Fall back to the accept page for error display
      navigate(`/accept-invite/${token}`);
    } finally {
      setAcceptingToken(null);
    }
  };

  const inviteBanner = pendingInvites.length > 0 && (
    <div className="mb-6 space-y-3">
      {pendingInvites.map((invite) => (
        <div
          key={invite.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal/30 bg-teal/10 px-4 py-3"
        >
          <div>
            <p className="text-sm font-medium text-gray-900">
              You've been invited to join <strong>{invite.orgName}</strong> as{' '}
              <span className="capitalize">{invite.role}</span>
            </p>
            <p className="text-xs text-gray-500">
              Expires {new Date(invite.expiresAt).toLocaleDateString()}
            </p>
          </div>
          <button
            onClick={() => handleAcceptInvite(invite.token)}
            disabled={acceptingToken === invite.token}
            className="rounded bg-teal px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
          >
            {acceptingToken === invite.token ? 'Accepting...' : 'Accept Invitation'}
          </button>
        </div>
      ))}
    </div>
  );

  if (!currentOrg) {
    return (
      <div>
        {inviteBanner}
        <div className="text-center py-20">
          <h2 className="text-2xl font-bold text-gray-900">Welcome to {{PROJECT_NAME}}</h2>
          <p className="mt-4 text-gray-600">
            You're not part of an organisation yet. Create one or accept an invitation to get
            started.
          </p>
          <Link
            to="/onboarding"
            className="mt-6 inline-block rounded-lg bg-teal px-6 py-3 text-white font-semibold hover:bg-teal-dark"
          >
            Create Organisation
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="py-20 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div>
      {inviteBanner}
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-gray-600">{currentOrg.name}</p>

      {detail && (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Active Subscriptions', value: detail.stats.subscriptions, link: '/licences' },
            { label: 'Licences', value: detail.stats.licences, link: '/licences' },
            { label: 'Team Members', value: detail.stats.memberships, link: '/settings' },
            { label: 'Support Tickets', value: detail.stats.tickets, link: '/support' },
          ].map((stat) => (
            <Link
              key={stat.label}
              to={stat.link}
              className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{stat.value}</p>
            </Link>
          ))}
        </div>
      )}

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        {/* Quick actions */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          <div className="mt-4 space-y-3">
            <Link
              to="/products"
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Browse Products
            </Link>
            <Link
              to="/licences"
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Manage Environments &amp; Activation Codes
            </Link>
            <Link
              to="/downloads"
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Downloads
            </Link>
            <Link
              to="/support"
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Create Support Ticket
            </Link>
            <Link
              to="/billing"
              className="block rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              Manage Billing
            </Link>
          </div>
        </div>

        {/* Getting started */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">Getting Started</h3>
          <ol className="mt-4 space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mojo/15 text-xs font-bold text-mojo-dark">
                1
              </span>
              Browse products and subscribe to a plan
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mojo/15 text-xs font-bold text-mojo-dark">
                2
              </span>
              Open the product settings in your Power Platform environment to find your Environment
              Code
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mojo/15 text-xs font-bold text-mojo-dark">
                3
              </span>
              Register the environment in this portal
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mojo/15 text-xs font-bold text-mojo-dark">
                4
              </span>
              Generate an activation code and paste it into your product settings
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
