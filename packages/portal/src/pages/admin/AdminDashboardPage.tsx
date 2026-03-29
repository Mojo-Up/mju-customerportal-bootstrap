import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../api/client';

interface Stats {
  organisations: number;
  users: number;
  activeSubscriptions: number;
  totalSubscriptions: number;
  openTickets: number;
  products: number;
}

export function AdminDashboardPage() {
  const { apiFetch } = useApi();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Stats>('/api/admin/stats')
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-red-700">{error}</div>
    );
  }

  if (loading || !stats) {
    return <div className="py-20 text-center text-gray-500">Loading...</div>;
  }

  const cards = [
    { label: 'Products', value: stats.products, link: '/admin/products' },
    { label: 'Organisations', value: stats.organisations, link: '/admin/organisations' },
    { label: 'Users', value: stats.users, link: '/admin/users' },
    {
      label: 'Active Subscriptions',
      value: stats.activeSubscriptions,
      link: '/admin/organisations',
    },
    { label: 'Total Subscriptions', value: stats.totalSubscriptions, link: '/admin/organisations' },
    { label: 'Open Tickets', value: stats.openTickets, link: '/admin' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <div className="flex gap-3 text-sm">
          <Link to="/admin/products" className="text-teal hover:text-teal-dark font-medium">
            Products
          </Link>
          <Link to="/admin/organisations" className="text-teal hover:text-teal-dark font-medium">
            Organisations
          </Link>
          <Link to="/admin/users" className="text-teal hover:text-teal-dark font-medium">
            Users
          </Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            to={card.link}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <p className="text-sm text-gray-500">{card.label}</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">{card.value}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
