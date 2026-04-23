'use client';

import { useState } from 'react';
import Link from 'next/link';

type DnsResult = { domain: string; status: 'deleted' | 'not_found' | 'error'; detail?: string };
type SecResult = { domain: string; status: 'ok' | 'error'; detail?: string };

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm text-gray-300 font-medium">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative flex-shrink-0 w-10 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-700'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  );
}

// ─── DNS Cleanup ──────────────────────────────────────────────────────────────

function DnsCleanup() {
  const [domainsText, setDomainsText] = useState('');
  const [ip, setIp] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DnsResult[]>([]);
  const [error, setError] = useState('');

  const domains = domainsText.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);

  async function handleRun() {
    setRunning(true); setResults([]); setError('');
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
    <section className="mb-12">
      <h2 className="text-lg font-semibold text-white mb-1">Remove A Record</h2>
      <p className="text-sm text-gray-500 mb-6">Delete a specific IP from all A records across multiple domains.</p>

      <div className="space-y-5 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">IP address to remove</label>
          <input
            type="text"
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="e.g. 97.74.186.14"
            className="font-mono w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Domains <span className="text-gray-500 font-normal">(one per line)</span>
          </label>
          <textarea
            value={domainsText}
            onChange={e => setDomainsText(e.target.value)}
            placeholder={'example.com\nanother.com'}
            rows={8}
            className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500 resize-none text-sm"
          />
          {domains.length > 0 && <p className="text-xs text-gray-500 mt-1">{domains.length} domains</p>}
        </div>
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

      <button
        onClick={handleRun}
        disabled={running || !domains.length || !ip.trim()}
        className="mb-6 px-5 py-2.5 bg-red-700 hover:bg-red-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {running ? 'Removing...' : `Remove from ${domains.length} domain${domains.length !== 1 ? 's' : ''}`}
      </button>

      {results.length > 0 && (
        <>
          <div className="flex gap-4 mb-3 text-sm">
            <span className="text-emerald-400 font-medium">{deleted} deleted</span>
            <span className="text-gray-500">{notFound} not found</span>
            {errors > 0 && <span className="text-red-400">{errors} errors</span>}
          </div>
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            {results.map((r, i) => (
              <div key={r.domain} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}>
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
        </>
      )}
    </section>
  );
}

// ─── Bulk Security ────────────────────────────────────────────────────────────

function BulkSecurity() {
  const [domainsText, setDomainsText] = useState('');
  const [botFightMode, setBotFightMode] = useState(false);
  const [aiLabyrinth, setAiLabyrinth] = useState(false);
  const [aiBotsProtection, setAiBotsProtection] = useState(false);
  const [enable, setEnable] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<SecResult[]>([]);
  const [error, setError] = useState('');

  const domains = domainsText.split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);
  const anySelected = botFightMode || aiLabyrinth || aiBotsProtection;

  async function handleRun() {
    setRunning(true); setResults([]); setError('');
    try {
      const res = await fetch('/api/bulk-security', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domains,
          action: {
            ...(botFightMode ? { botFightMode: enable } : {}),
            ...(aiLabyrinth ? { aiLabyrinth: enable } : {}),
            ...(aiBotsProtection ? { aiBotsProtection: enable } : {}),
          },
        }),
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

  const ok = results.filter(r => r.status === 'ok').length;
  const errors = results.filter(r => r.status === 'error').length;

  return (
    <section>
      <h2 className="text-lg font-semibold text-white mb-1">Bulk Bot Settings</h2>
      <p className="text-sm text-gray-500 mb-6">Enable or disable bot protection across multiple domains at once.</p>

      <div className="border border-gray-800 rounded-lg p-4 mb-5 space-y-4">
        <Toggle label="Bot Fight Mode" description="Challenges known bots with a JS challenge." checked={botFightMode} onChange={setBotFightMode} />
        <Toggle label="AI Labyrinth" description="Adds honeypot links to disrupt AI crawlers." checked={aiLabyrinth} onChange={setAiLabyrinth} />
        <Toggle label="AI Bots Protection" description="Blocks known AI crawlers by user agent." checked={aiBotsProtection} onChange={setAiBotsProtection} />
      </div>

      <div className="flex gap-2 mb-5">
        {(['disable', 'enable'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => setEnable(mode === 'enable')}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              (mode === 'enable') === enable
                ? mode === 'enable' ? 'bg-indigo-600 text-white' : 'bg-red-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Domains <span className="text-gray-500 font-normal">(one per line)</span>
        </label>
        <textarea
          value={domainsText}
          onChange={e => setDomainsText(e.target.value)}
          placeholder={'example.com\nanother.com'}
          rows={8}
          className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none text-sm"
        />
        {domains.length > 0 && <p className="text-xs text-gray-500 mt-1">{domains.length} domains</p>}
      </div>

      {error && <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>}

      <button
        onClick={handleRun}
        disabled={running || !domains.length || !anySelected}
        className="mb-6 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        {running ? 'Applying...' : `${enable ? 'Enable' : 'Disable'} on ${domains.length} domain${domains.length !== 1 ? 's' : ''}`}
      </button>

      {results.length > 0 && (
        <>
          <div className="flex gap-4 mb-3 text-sm">
            <span className="text-emerald-400 font-medium">{ok} updated</span>
            {errors > 0 && <span className="text-red-400">{errors} errors</span>}
          </div>
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            {results.map((r, i) => (
              <div key={r.domain} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}>
                <span className="font-mono text-sm text-white">{r.domain}</span>
                <div className="flex items-center gap-2">
                  {r.detail && <span className="text-xs text-gray-500">{r.detail}</span>}
                  {r.status === 'ok' && <span className="text-xs font-medium text-emerald-400">Updated</span>}
                  {r.status === 'error' && <span className="text-xs font-medium text-red-400">Error</span>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CleanupPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bulk Operations</h1>
          <p className="text-gray-400 mt-1 text-sm">Manage DNS records and security settings across multiple domains.</p>
        </div>
        <Link href="/provision" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Provisioner
        </Link>
      </div>

      <div className="border-b border-gray-800 mb-10" />
      <DnsCleanup />
      <div className="border-b border-gray-800 mb-10" />
      <BulkSecurity />
    </main>
  );
}
