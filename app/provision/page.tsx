'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

type NamecheapDomain = { name: string; isOurDNS: boolean; expires: string; created: string };
type SortKey = 'name' | 'created' | 'expires';
type SortDir = 'asc' | 'desc';

// Parse MM/DD/YYYY dates for comparison
function parseDate(d: string) {
  const [m, day, y] = d.split('/');
  return new Date(+y, +m - 1, +day).getTime() || 0;
}
type DomainEntry = NamecheapDomain & { selected: boolean; ip: string };
type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };
type JobState = 'pending' | 'running' | 'done' | 'error';
type Job = { id: string; domain: string; ip: string; state: JobState; steps: StepResult[]; nameservers?: string[] };
type WizardStep = 1 | 2 | 3;
type SecuritySettings = { botFightMode: boolean; aiLabyrinth: boolean; aiBotsProtection: boolean };
type NetworkSettings = { proxy: boolean; sslMode: 'flexible' | 'full' | 'none' };
type RecordEntry = { id: string; type: 'A' | 'CNAME'; name: string; content: string };

const STEP_NAMES = ['Add to Cloudflare', 'Add DNS records', 'Enable security', 'Set SSL/TLS', 'Set nameservers'];

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({ label, description, checked, onChange }: {
  label: string; description: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <div className="relative mt-0.5 flex-shrink-0">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-indigo-600' : 'bg-gray-700'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </div>
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: WizardStep }) {
  const steps = ['Select Domains', 'Configure Records', 'Review & Provision'];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, i) => {
        const n = (i + 1) as WizardStep;
        const active = n === current;
        const done = n < current;
        return (
          <div key={n} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              active ? 'bg-indigo-600 text-white' :
              done   ? 'bg-gray-800 text-emerald-400' :
                       'bg-gray-900 text-gray-600'
            }`}>
              <span>{done ? '✓' : n}</span>
              <span>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px mx-1 ${n < current ? 'bg-gray-600' : 'bg-gray-800'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Select domains ───────────────────────────────────────────────────

function Step1({
  domains, setDomains, onNext,
}: {
  domains: DomainEntry[];
  setDomains: (d: DomainEntry[]) => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteValue, setPasteValue] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const selected = domains.filter(d => d.selected);
  const allSelected = domains.length > 0 && domains.every(d => d.selected);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
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
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/provision/domains');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch domains');
      setDomains(data.domains.map((d: NamecheapDomain) => ({ ...d, selected: false, ip: '' })));
      setPasteMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }

  function loadFromPaste() {
    const entries = pasteValue
      .split('\n')
      .map(l => l.trim().toLowerCase())
      .filter(Boolean)
      .map(name => ({ name, isOurDNS: true, created: '', expires: '', selected: true, ip: '' }));
    setDomains(entries);
    setPasteMode(false);
    setPasteValue('');
  }

  function toggleAll() {
    setDomains(domains.map(d => ({ ...d, selected: !allSelected })));
  }

  function toggle(name: string) {
    setDomains(domains.map(d => d.name === name ? { ...d, selected: !d.selected } : d));
  }

  return (
    <div>
      {/* Source buttons */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={fetchFromNamecheap}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Fetching…' : 'Fetch from Namecheap'}
        </button>
        <button
          onClick={() => setPasteMode(p => !p)}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
        >
          {pasteMode ? 'Cancel' : 'Paste domains'}
        </button>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">{error}</div>
      )}

      {pasteMode && (
        <div className="mb-6">
          <textarea
            value={pasteValue}
            onChange={e => setPasteValue(e.target.value)}
            placeholder={'example.com\nanotherdomain.com\n...'}
            rows={6}
            className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none text-sm"
            autoFocus
          />
          <button
            onClick={loadFromPaste}
            disabled={!pasteValue.trim()}
            className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Load {pasteValue.split('\n').filter(l => l.trim()).length} domains
          </button>
        </div>
      )}

      {domains.length > 0 && (
        <>
          {/* Controls */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-500" />
                Select all
              </label>
              <span className="text-xs text-gray-600">{domains.length} domains</span>
              {selected.length > 0 && (
                <span className="text-xs text-indigo-400">{selected.length} selected</span>
              )}
            </div>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter domains…"
              className="text-xs bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-44"
            />
          </div>

          {/* Domain list */}
          <div className="border border-gray-800 rounded-lg overflow-hidden mb-6">
            {/* Sort headers */}
            <div className="grid grid-cols-[auto_1fr_100px_100px_80px] items-center bg-gray-900 border-b border-gray-800 px-4 py-2 gap-3">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-500" />
              {(['name', 'created', 'expires'] as SortKey[]).map(key => (
                <button
                  key={key}
                  onClick={() => toggleSort(key)}
                  className={`text-left text-xs font-medium uppercase tracking-wider transition-colors ${
                    sortKey === key ? 'text-indigo-400' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {key} {sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </button>
              ))}
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">NS</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {filtered.map((d, i) => (
                <label
                  key={d.name}
                  className={`grid grid-cols-[auto_1fr_100px_100px_80px] items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-800/50 transition-colors ${
                    i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={d.selected}
                    onChange={() => toggle(d.name)}
                    className="accent-indigo-500 flex-shrink-0"
                  />
                  <span className="font-mono text-sm text-white truncate">{d.name}</span>
                  <span className="text-xs text-gray-500">{d.created}</span>
                  <span className="text-xs text-gray-500">{d.expires}</span>
                  {d.isOurDNS
                    ? <span className="text-xs text-gray-700">default</span>
                    : <span className="text-xs text-amber-500">custom</span>}
                </label>
              ))}
            </div>
          </div>

          <button
            onClick={onNext}
            disabled={selected.length === 0}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Next: Configure Records →
          </button>
        </>
      )}
    </div>
  );
}

// ─── Step 2: Configure records ────────────────────────────────────────────────

function Step2({
  domains, security, setSecurity, network, setNetwork, records, setRecords, onBack, onNext,
}: {
  domains: DomainEntry[];
  security: SecuritySettings;
  setSecurity: (s: SecuritySettings) => void;
  network: NetworkSettings;
  setNetwork: (n: NetworkSettings) => void;
  records: RecordEntry[];
  setRecords: (r: RecordEntry[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  function addRecord() {
    setRecords([...records, { id: Math.random().toString(36).slice(2), type: 'A', name: '', content: '' }]);
  }
  function removeRecord(id: string) {
    setRecords(records.filter(r => r.id !== id));
  }
  function updateRecord(id: string, patch: Partial<RecordEntry>) {
    setRecords(records.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  const selected = domains.filter(d => d.selected);
  const canNext = records.length > 0 && records.every(r => r.name.trim() && r.content.trim());

  return (
    <div>
      {/* Network settings */}
      <div className="border border-gray-800 rounded-lg p-4 mb-6 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">DNS & Network</p>
        <Toggle
          label="Cloudflare Proxy"
          description="Route traffic through Cloudflare (orange cloud). Disable for DNS-only."
          checked={network.proxy}
          onChange={v => setNetwork({ ...network, proxy: v })}
        />
        <div>
          <p className="text-sm text-gray-300 font-medium mb-1">SSL/TLS Mode</p>
          <p className="text-xs text-gray-500 mb-3">Encryption mode between Cloudflare and your origin server.</p>
          <div className="flex gap-2">
            {(['none', 'flexible', 'full'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setNetwork({ ...network, sslMode: mode })}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  network.sslMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {mode === 'none' ? "Don't set" : mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Records builder */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">DNS Records</p>
          <p className="text-xs text-gray-500">Applied to all {selected.length} domains · TTL: Auto</p>
        </div>
        <div className="border border-gray-800 rounded-lg overflow-hidden mb-3">
          <div className="grid grid-cols-[80px_130px_1fr_32px] bg-gray-900 border-b border-gray-800 px-3 py-2 gap-2">
            <span className="text-xs font-medium text-gray-400">Type</span>
            <span className="text-xs font-medium text-gray-400">Name</span>
            <span className="text-xs font-medium text-gray-400">Content</span>
            <span />
          </div>
          {records.map(r => (
            <div key={r.id} className="grid grid-cols-[80px_130px_1fr_32px] items-center gap-2 px-3 py-2.5 border-b border-gray-800/40 last:border-0 bg-gray-900/50">
              <select
                value={r.type}
                onChange={e => updateRecord(r.id, { type: e.target.value as 'A' | 'CNAME' })}
                className="font-mono bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-indigo-500 w-full"
              >
                <option>A</option>
                <option>CNAME</option>
              </select>
              <input
                type="text"
                value={r.name}
                onChange={e => updateRecord(r.id, { name: e.target.value })}
                placeholder="@ or *"
                className="font-mono bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-full"
              />
              <input
                type="text"
                value={r.content}
                onChange={e => updateRecord(r.id, { content: e.target.value })}
                placeholder={r.type === 'A' ? '1.2.3.4' : 'target.com'}
                className="font-mono bg-gray-800 border border-gray-700 rounded px-2.5 py-1.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-full"
              />
              <button
                onClick={() => removeRecord(r.id)}
                disabled={records.length === 1}
                className="text-gray-600 hover:text-red-400 disabled:opacity-30 transition-colors text-lg leading-none"
              >×</button>
            </div>
          ))}
        </div>
        <button onClick={addRecord} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
          + Add record
        </button>
      </div>

      {/* Security settings */}
      <div className="border border-gray-800 rounded-lg p-4 mb-6 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Security Settings</p>
        <Toggle label="Bot Fight Mode" description="Challenges requests from known bots with a JavaScript challenge." checked={security.botFightMode} onChange={v => setSecurity({ ...security, botFightMode: v })} />
        <Toggle label="AI Labyrinth (Beta)" description="Adds nofollow links with AI-generated content to disrupt bots ignoring crawling standards." checked={security.aiLabyrinth} onChange={v => setSecurity({ ...security, aiLabyrinth: v })} />
        <Toggle label="AI Bots Protection" description="Blocks known AI crawlers (GPTBot, ClaudeBot, etc.) by user agent." checked={security.aiBotsProtection} onChange={v => setSecurity({ ...security, aiBotsProtection: v })} />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onBack} className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">← Back</button>
        <button onClick={onNext} disabled={!canNext} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors">
          {canNext ? 'Next: Review →' : 'Complete all record fields'}
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Review & provision ───────────────────────────────────────────────

function StepBadge({ step }: { step: StepResult | undefined }) {
  if (!step) return <span className="text-gray-700 text-xs">—</span>;
  if (step.status === 'ok') return <span className="text-emerald-400 text-xs font-medium" title={step.detail}>✓</span>;
  return <span className="text-red-400 text-xs font-medium" title={step.detail}>✗ {step.detail && <span className="font-normal">{step.detail}</span>}</span>;
}

function Step3({
  domains, security, network, records, onBack,
}: {
  domains: DomainEntry[];
  security: SecuritySettings;
  network: NetworkSettings;
  records: RecordEntry[];
  onBack: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const selected = domains.filter(d => d.selected);


  function updateJob(id: string, patch: Partial<Job>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }

  async function processJob(job: Job) {
    updateJob(job.id, { state: 'running' });
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: job.domain, security, network, records }),
      });
      const data = await res.json();
      const allOk = data.steps?.every((s: StepResult) => s.status === 'ok');
      updateJob(job.id, { state: allOk ? 'done' : 'error', steps: data.steps ?? [], nameservers: data.nameservers });
    } catch {
      updateJob(job.id, { state: 'error', steps: [{ name: 'Request', status: 'error', detail: 'Network error' }] });
    }
  }

  async function handleStart() {
    const newJobs: Job[] = selected.map(d => ({
      id: crypto.randomUUID(), domain: d.name, ip: d.ip, state: 'pending', steps: [],
    }));
    setJobs(newJobs);
    setRunning(true);
    setStarted(true);

    const CONCURRENCY = 5;
    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      await Promise.all(newJobs.slice(i, i + CONCURRENCY).map(job => processJob(job)));
    }
    setRunning(false);
  }

  const done = jobs.filter(j => j.state === 'done').length;
  const errors = jobs.filter(j => j.state === 'error').length;

  return (
    <div>
      {/* Summary */}
      {!started && (
        <div className="mb-6 px-4 py-4 bg-gray-900 border border-gray-800 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Domains to provision</span>
            <span className="text-white font-medium">{selected.length}</span>
          </div>
          <div className="flex items-start justify-between text-sm gap-4">
            <span className="text-gray-400 flex-shrink-0">DNS records</span>
            <div className="text-right font-mono text-xs text-white space-y-0.5">
              {records.map(r => (
                <div key={r.id}>{r.type} {r.name} → {r.content}</div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-400">Security</span>
            <span className="text-gray-300">
              {[
                security.botFightMode && 'Bot Fight Mode',
                security.aiLabyrinth && 'AI Labyrinth',
                security.aiBotsProtection && 'AI Bots Protection',
              ].filter(Boolean).join(' · ') || 'None'}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      {!started && (
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors">
            ← Back
          </button>
          <button
            onClick={handleStart}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Provision {selected.length} domain{selected.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

      {/* Progress */}
      {started && (
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            {running ? `Running… ${done + errors} / ${jobs.length}` : `Done — `}
            {!running && <><span className="text-emerald-400 font-medium">{done} succeeded</span>{errors > 0 && <span className="text-red-400 font-medium ml-2">{errors} failed</span>}</>}
          </span>
        </div>
      )}

      {/* Results table */}
      {jobs.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900 border-b border-gray-800">
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Domain</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-gray-400">IP</th>
                {STEP_NAMES.map(s => (
                  <th key={s} className="text-center px-3 py-2.5 text-xs font-medium text-gray-400 whitespace-nowrap">{s}</th>
                ))}
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Nameservers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/50">
              {jobs.map(job => (
                <tr key={job.id} className="bg-gray-900/40 hover:bg-gray-800/40 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-white text-xs">{job.domain}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-400 text-xs">{job.ip}</td>
                  {STEP_NAMES.map(name => (
                    <td key={name} className="px-3 py-2.5 text-center">
                      {job.state === 'pending' ? <span className="text-gray-700 text-xs">·</span>
                        : job.state === 'running' && job.steps.length === 0 ? <span className="text-gray-500 text-xs animate-pulse">…</span>
                        : <StepBadge step={job.steps.find(s => s.name === name)} />}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">
                    {job.nameservers ? job.nameservers.join(', ')
                      : job.state === 'running' ? <span className="animate-pulse text-gray-600">…</span>
                      : <span className="text-gray-700">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProvisionPage() {
  const [step, setStep] = useState<WizardStep>(1);
  const [domains, setDomains] = useState<DomainEntry[]>([]);
  const [security, setSecurity] = useState<SecuritySettings>({ botFightMode: false, aiLabyrinth: false, aiBotsProtection: false });
  const [network, setNetwork] = useState<NetworkSettings>({ proxy: false, sslMode: 'none' });
  const [records, setRecords] = useState<RecordEntry[]>([{ id: '1', type: 'A', name: '@', content: '' }]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Domain Provisioner</h1>
          <p className="text-gray-400 mt-1 text-sm">Add domains to Cloudflare, set DNS records, and update nameservers in Namecheap.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Domain Finder
        </Link>
      </div>

      <StepIndicator current={step} />

      {step === 1 && (
        <Step1
          domains={domains}
          setDomains={setDomains}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2
          domains={domains}
          security={security}
          setSecurity={setSecurity}
          network={network}
          setNetwork={setNetwork}
          records={records}
          setRecords={setRecords}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3
          domains={domains}
          security={security}
          network={network}
          records={records}
          onBack={() => setStep(2)}
        />
      )}
    </main>
  );
}
