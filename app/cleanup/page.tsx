'use client';

import { useState } from 'react';
import Link from 'next/link';

type Result = { domain: string; status: 'deleted' | 'not_found' | 'error'; detail?: string };

export default function CleanupPage() {
  const [domainsText, setDomainsText] = useState('');
  const [ip, setIp] = useState('97.74.186.14');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');

  const domains = domainsText.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);

  async function handleRun() {
    if (!domains.length || !ip.trim()) return;
    setRunning(true);
    setResults([]);
    setError('');

    try {
      const res = await fetch('/api/cleanup-dns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains, ip: ip.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setRunning(false);
    }
  }

  const deleted = results.filter(r => r.status === 'deleted').length;
  const notFound = results.filter(r => r.status === 'not_found').length;
  const errors = results.filter(r => r.status === 'error').length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">DNS Cleanup</h1>
          <p className="text-gray-400 mt-1 text-sm">Remove a specific A record IP across multiple domains.</p>
        </div>
        <Link href="/provision" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Provisioner
        </Link>
      </div>

      <div className="space-y-5 mb-8">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            IP address to remove
          </label>
          <input
            type="text"
            value={ip}
            onChange={e => setIp(e.target.value)}
            className="font-mono w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:outline-none focus:border-red-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Domains <span className="text-gray-500 font-normal">(one per line)</span>
          </label>
          <textarea
            value={domainsText}
            onChange={e => setDomainsText(e.target.value)}
            placeholder={'example.com\nanother.com\n...'}
            rows={10}
            className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none text-sm"
          />
          {domains.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">{domains.length} domain{domains.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      <button
        onClick={handleRun}
        disabled={running || domains.length === 0 || !ip.trim()}
        className="mb-8 px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {running ? 'Removing...' : `Remove ${ip} from ${domains.length} domain${domains.length !== 1 ? 's' : ''}`}
      </button>

      {results.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-4 text-sm">
            <span className="text-emerald-400 font-medium">{deleted} deleted</span>
            <span className="text-gray-500">{notFound} not found</span>
            {errors > 0 && <span className="text-red-400">{errors} errors</span>}
          </div>

          <div className="border border-gray-800 rounded-lg overflow-hidden">
            {results.map((r, i) => (
              <div
                key={r.domain}
                className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}
              >
                <span className="font-mono text-sm text-white">{r.domain}</span>
                <div className="flex items-center gap-2">
                  {r.detail && <span className="text-xs text-gray-500">{r.detail}</span>}
                  {r.status === 'deleted' && <span className="text-xs font-medium text-emerald-400">Deleted</span>}
                  {r.status === 'not_found' && <span className="text-xs text-gray-600">Not found</span>}
                  {r.status === 'error' && <span className="text-xs font-medium text-red-400">Error</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
