'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

type NamecheapDomain = { name: string; isOurDNS: boolean; expires: string; created: string };
type DomainEntry = NamecheapDomain & { selected: boolean };
type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };
type JobState = 'pending' | 'running' | 'done' | 'error';
type Job = { domain: string; state: JobState; steps: StepResult[] };
type SortKey = 'name' | 'created' | 'expires';
type SortDir = 'asc' | 'desc';

function parseDate(d: string) {
  const [m, day, y] = d.split('/');
  return new Date(+y, +m - 1, +day).getTime() || 0;
}

function SortBtn({ label, k, sortKey, sortDir, onToggle }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir; onToggle: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <button
      onClick={() => onToggle(k)}
      className={`text-xs font-medium transition-colors ${active ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'}`}
    >
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </button>
  );
}

export default function VercelProvisionPage() {
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [mode, setMode] = useState<'nameservers' | 'arecord'>('nameservers');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [provisioning, setProvisioning] = useState(false);

  const selected = domains.filter(d => d.selected);
  const allSelected = domains.length > 0 && domains.every(d => d.selected);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    const list = domains.filter(d => d.name.includes(search.toLowerCase()));
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
      else if (sortKey === 'created') cmp = parseDate(a.created) - parseDate(b.created);
      else if (sortKey === 'expires') cmp = parseDate(a.expires) - parseDate(b.expires);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [domains, search, sortKey, sortDir]);

  async function fetchFromNamecheap() {
    setLoading(true); setFetchError('');
    try {
      const res = await fetch('/api/provision/domains');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setDomains(data.domains.map((d: NamecheapDomain) => ({ ...d, selected: false })));
      setPasteMode(false);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }

  function loadFromPaste() {
    const entries = pasteValue.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean)
      .map(name => ({ name, isOurDNS: true, created: '', expires: '', selected: true }));
    setDomains(entries);
    setPasteMode(false);
    setPasteValue('');
  }

  function toggleAll() { setDomains(domains.map(d => ({ ...d, selected: !allSelected }))); }
  function toggle(name: string) { setDomains(domains.map(d => d.name === name ? { ...d, selected: !d.selected } : d)); }

  async function handleProvision() {
    if (!selected.length) return;
    const domainNames = selected.map(d => d.name);
    setJobs(domainNames.map(domain => ({ domain, state: 'pending', steps: [] })));
    setProvisioning(true);

    for (const domain of domainNames) {
      setJobs(prev => prev.map(j => j.domain === domain ? { ...j, state: 'running' } : j));
      try {
        const res = await fetch('/api/vercel-provision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: [domain], mode }),
        });
        const data = await res.json();
        const result = data.results?.[0];
        const allOk = result?.steps.every((s: StepResult) => s.status === 'ok');
        setJobs(prev => prev.map(j =>
          j.domain === domain ? { ...j, state: allOk ? 'done' : 'error', steps: result?.steps ?? [] } : j
        ));
      } catch {
        setJobs(prev => prev.map(j =>
          j.domain === domain ? { ...j, state: 'error', steps: [{ name: 'Request', status: 'error', detail: 'Network error' }] } : j
        ));
      }
    }
    setProvisioning(false);
  }

  const doneCount = jobs.filter(j => j.state === 'done').length;
  const errorCount = jobs.filter(j => j.state === 'error').length;

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Vercel Provisioner</h1>
          <p className="text-gray-400 mt-1 text-sm">Add domains to your Vercel project and configure DNS in Namecheap.</p>
        </div>
        <Link href="/provision" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Cloudflare Provisioner
        </Link>
      </div>

      {/* Domain selection */}
      <section className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={fetchFromNamecheap}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Loading…' : 'Fetch from Namecheap'}
          </button>
          <button
            onClick={() => setPasteMode(v => !v)}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            Paste domains
          </button>
          {domains.length > 0 && (
            <span className="text-xs text-gray-500 ml-auto">{selected.length} of {domains.length} selected</span>
          )}
        </div>

        {fetchError && (
          <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{fetchError}</div>
        )}

        {pasteMode && (
          <div className="mb-4">
            <textarea
              value={pasteValue}
              onChange={e => setPasteValue(e.target.value)}
              placeholder={'example.com\nanother.com'}
              rows={5}
              className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none text-sm mb-2"
            />
            <button
              onClick={loadFromPaste}
              disabled={!pasteValue.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Load
            </button>
          </div>
        )}

        {domains.length > 0 && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter domains…"
                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <div className="flex items-center gap-3 text-xs text-gray-500">
                Sort:
                <SortBtn label="Name" k="name" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn label="Created" k="created" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
                <SortBtn label="Expires" k="expires" sortKey={sortKey} sortDir={sortDir} onToggle={toggleSort} />
              </div>
            </div>

            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="accent-indigo-500"
                />
                <span className="text-xs text-gray-500">Select all</span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-800/50">
                {filtered.map(d => (
                  <label key={d.name} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-900/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={d.selected}
                      onChange={() => toggle(d.name)}
                      className="accent-indigo-500 flex-shrink-0"
                    />
                    <span className="font-mono text-sm text-white flex-1">{d.name}</span>
                    {d.created && <span className="text-xs text-gray-600">{d.created}</span>}
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {/* DNS mode + provision */}
      {selected.length > 0 && jobs.length === 0 && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 p-1 bg-gray-900 border border-gray-800 rounded-lg">
            {(['nameservers', 'arecord'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  mode === m ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {m === 'nameservers' ? 'Nameservers' : 'A record'}
              </button>
            ))}
          </div>
          <button
            onClick={handleProvision}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Provision {selected.length} domain{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Results */}
      {jobs.length > 0 && (
        <section>
          <div className="flex items-center gap-4 mb-4 text-sm">
            {provisioning
              ? <span className="text-indigo-400 animate-pulse">Provisioning…</span>
              : <span className="text-gray-400">Done</span>}
            {doneCount > 0 && <span className="text-emerald-400 font-medium">{doneCount} succeeded</span>}
            {errorCount > 0 && <span className="text-red-400 font-medium">{errorCount} failed</span>}
            {!provisioning && (
              <button
                onClick={() => { setJobs([]); }}
                className="ml-auto text-xs text-gray-500 hover:text-gray-300"
              >
                Clear
              </button>
            )}
          </div>

          <div className="border border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-800">
            {jobs.map(job => (
              <div key={job.domain} className="px-4 py-3">
                <div className="flex items-center gap-3 mb-1.5">
                  <span className="font-mono text-sm text-white">{job.domain}</span>
                  {job.state === 'pending'  && <span className="text-xs text-gray-600">Waiting…</span>}
                  {job.state === 'running'  && <span className="text-xs text-indigo-400 animate-pulse">Running…</span>}
                  {job.state === 'done'     && <span className="text-xs text-emerald-400 font-medium">Done</span>}
                  {job.state === 'error'    && <span className="text-xs text-red-400 font-medium">Failed</span>}
                </div>
                {job.steps.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {job.steps.map(s => (
                      <span key={s.name} className="text-xs text-gray-500">
                        <span className={s.status === 'ok' ? 'text-emerald-400' : 'text-red-400'}>
                          {s.status === 'ok' ? '✓' : '✗'}
                        </span>{' '}
                        {s.name}{s.detail ? `: ${s.detail}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
