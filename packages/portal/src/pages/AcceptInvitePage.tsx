import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../api/client';
import { useOrg } from '../contexts/OrgContext';

export function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const { apiFetch } = useApi();
  const { refetch } = useOrg();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    apiFetch<{ message: string; orgId: string }>(`/api/organisations/invitations/${token}/accept`, {
      method: 'POST',
    })
      .then(async (res) => {
        setStatus('success');
        setMessage('Invitation accepted! Redirecting to dashboard...');
        await refetch();
        setTimeout(() => navigate('/dashboard'), 1500);
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Failed to accept invitation');
      });
  }, [token]);

  return (
    <div className="py-20 text-center">
      {status === 'loading' && <p className="text-gray-500">Accepting invitation...</p>}
      {status === 'success' && (
        <div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-6 w-6 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-900">{message}</p>
        </div>
      )}
      {status === 'error' && (
        <div>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-6 w-6 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-red-600">{message}</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 rounded bg-teal px-4 py-2 text-sm font-medium text-white hover:bg-teal-dark"
          >
            Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
