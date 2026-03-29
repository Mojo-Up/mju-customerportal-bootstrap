import { useEffect, useState } from 'react';
import { useOrg } from '../contexts/OrgContext';
import { useApi } from '../api/client';

interface TicketItem {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdBy: { name: string; email: string };
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductOption {
  id: string;
  name: string;
}

export function SupportPage() {
  const { currentOrg } = useOrg();
  const { apiFetch } = useApi();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('medium');
  const [productId, setProductId] = useState('');

  useEffect(() => {
    if (!currentOrg) return;
    Promise.all([
      apiFetch<{ data: TicketItem[] }>(`/api/organisations/${currentOrg.id}/tickets`).then((r) =>
        setTickets(r.data),
      ),
      apiFetch<ProductOption[]>('/api/products').then(setProducts),
    ])
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [currentOrg?.id]);

  const handleCreateTicket = async () => {
    if (!currentOrg || !subject || !body) return;
    await apiFetch(`/api/organisations/${currentOrg.id}/tickets`, {
      method: 'POST',
      body: { subject, body, priority, ...(productId ? { productId } : {}) },
    });
    setShowForm(false);
    setSubject('');
    setBody('');
    setProductId('');
    const r = await apiFetch<{ data: TicketItem[] }>(`/api/organisations/${currentOrg.id}/tickets`);
    setTickets(r.data);
  };

  if (!currentOrg) return <p className="text-gray-500">Select an organisation first.</p>;

  const statusColour: Record<string, string> = {
    open: 'bg-teal/15 text-teal-dark',
    in_progress: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
    closed: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Support</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
        >
          New Ticket
        </button>
      </div>

      {showForm && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">Create Support Ticket</h3>
          <div className="mt-4 space-y-4">
            <input
              type="text"
              placeholder="Subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <textarea
              placeholder="Describe your issue..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex flex-wrap gap-3">
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Product (optional)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCreateTicket}
                disabled={!subject || !body}
                className="rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark disabled:opacity-50"
              >
                Submit Ticket
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="rounded bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="mt-8 text-gray-500">Loading...</p>
      ) : tickets.length === 0 ? (
        <p className="mt-8 text-gray-500">No support tickets yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {tickets.map((ticket) => (
            <div
              key={ticket.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:shadow-sm transition-shadow"
            >
              <div>
                <p className="font-medium text-gray-900">{ticket.subject}</p>
                <p className="text-xs text-gray-500">
                  {ticket.createdBy.name} — {new Date(ticket.createdAt).toLocaleDateString('en-AU')}
                  {' · '}
                  {ticket.messageCount} message{ticket.messageCount !== 1 ? 's' : ''}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColour[ticket.status] || ''}`}
              >
                {ticket.status.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
