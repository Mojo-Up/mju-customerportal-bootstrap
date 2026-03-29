import { useEffect, useState } from 'react';
import { useApi, isSafeRedirectUrl } from '../api/client';

interface DownloadItem {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  fileSize: number;
  updatedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const categoryLabels: Record<string, string> = {
  solution: 'Power Platform Solutions',
  powerbi: 'Power BI Models',
  guide: 'Guides & Documentation',
};

export function DownloadsPage() {
  const { apiFetch } = useApi();
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DownloadItem[]>('/api/downloads')
      .then(setDownloads)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleDownload = async (fileId: string) => {
    const { url } = await apiFetch<{ url: string }>(`/api/downloads/${fileId}/url`);
    if (isSafeRedirectUrl(url)) {
      window.open(url, '_blank');
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const grouped = downloads.reduce(
    (acc, d) => {
      (acc[d.category] = acc[d.category] || []).push(d);
      return acc;
    },
    {} as Record<string, DownloadItem[]>,
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Downloads</h1>
      <p className="mt-1 text-gray-600">
        Download the latest solutions, Power BI models, and guides for your products.
      </p>

      {downloads.length === 0 ? (
        <p className="mt-8 text-gray-500">No downloads available yet.</p>
      ) : (
        Object.entries(grouped).map(([category, files]) => (
          <div key={category} className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900">
              {categoryLabels[category] || category}
            </h2>
            <div className="mt-3 space-y-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      v{file.version} · {formatBytes(file.fileSize)} · Updated{' '}
                      {new Date(file.updatedAt).toLocaleDateString('en-AU')}
                    </p>
                    <p className="mt-1 text-sm text-gray-600">{file.description}</p>
                  </div>
                  <button
                    onClick={() => handleDownload(file.id)}
                    className="rounded bg-teal px-4 py-1.5 text-xs font-medium text-white hover:bg-teal-dark"
                  >
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
