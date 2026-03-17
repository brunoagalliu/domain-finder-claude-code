'use client';

import { useState } from 'react';
import Link from 'next/link';

type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };

type DomainJob = {
  id: string;
  domain: string;
  ip: string;
  state: 'pending' | 'running' | 'done' | 'error';
  nameservers?: string[];
  steps: StepResult[];
};

function parseInput(raw: string): { domain: string; ip: string }[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/[\s,\t]+/);
      return { domain: parts[0]?.toLowerCase(), ip: parts[1] ?? '' };
    })
    .filter(({ domain, ip }) => domain && ip);
}

const STEP_NAMES = ['Add to Cloudflare', 'Add A record', 'Enable security', 'Set nameservers'];

function StepBadge({ step }: { step: StepResult | undefined }) {
  if (!step) return <span className="text-gray-700 text-xs">—</span>;
  if (step.status === 'ok') return (
    <span className="text-emerald-400 text-xs font-medium" title={step.detail}>✓</span>
  );
  return (
    <span className="text-red-400 text-xs font-medium" title={step.detail}>✗</span>
  );
}

export default function ProvisionPage() {
  const [input, setInput] = useState('');
  const [jobs, setJobs] = useState<DomainJob[]>([]);
  const [running, setRunning] = useState(false);

  function updateJob(id: string, patch: Partial<DomainJob>) {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j));
  }

  async function processJob(job: DomainJob) {
    updateJob(job.id, { state: 'running' });
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: job.domain, ip: job.ip }),
      });
      const data = await res.json();
      const allOk = data.steps?.every((s: StepResult) => s.status === 'ok');
      updateJob(job.id, {
        state: allOk ? 'done' : 'error',
        steps: data.steps ?? [],
        nameservers: data.nameservers,
      });
    } catch {
      updateJob(job.id, { state: 'error', steps: [{ name: 'Request', status: 'error', detail: 'Network error' }] });
    }
  }

  async function handleProvision() {
    const parsed = parseInput(input);
    if (parsed.length === 0) return;

    const newJobs: DomainJob[] = parsed.map(({ domain, ip }) => ({
      id: crypto.randomUUID(),
      domain,
      ip,
      state: 'pending',
      steps: [],
    }));

    setJobs(newJobs);
    setRunning(true);

    // Process 5 at a time
    const CONCURRENCY = 5;
    for (let i = 0; i < newJobs.length; i += CONCURRENCY) {
      const batch = newJobs.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(job => processJob(job)));
    }

    setRunning(false);
  }

  const done = jobs.filter(j => j.state === 'done').length;
  const errors = jobs.filter(j => j.state === 'error').length;

  return (
    <main className="max-w-5xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Domain Provisioner</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Paste domains + IPs, one per line. Adds each to Cloudflare, sets A record, enables security, updates Namecheap nameservers.
          </p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Domain Finder
        </Link>
      </div>

      {/* Input */}
      <section className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Domains and IPs <span className="text-gray-500 font-normal">(one per line: domain.com 1.2.3.4)</span>
        </label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={'example.com 1.2.3.4\nanotherdomain.com 5.6.7.8'}
          rows={6}
          className="w-full font-mono bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none text-sm"
          disabled={running}
        />
        <div className="flex items-center gap-4 mt-3">
          <button
            onClick={handleProvision}
            disabled={running || !input.trim()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {running
              ? `Provisioning… (${done + errors}/${jobs.length})`
              : `Provision ${parseInput(input).length || ''} domains`.trim()}
          </button>
          {jobs.length > 0 && !running && (
            <span className="text-sm text-gray-500">
              <span className="text-emerald-400 font-medium">{done} done</span>
              {errors > 0 && <span className="text-red-400 font-medium ml-2">{errors} failed</span>}
            </span>
          )}
        </div>
      </section>

      {/* Results table */}
      {jobs.length > 0 && (
        <section>
          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900 border-b border-gray-800">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">Domain</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-400">IP</th>
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
                    <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">{job.ip}</td>
                    {STEP_NAMES.map(name => (
                      <td key={name} className="px-3 py-2.5 text-center">
                        {job.state === 'pending' ? (
                          <span className="text-gray-700 text-xs">·</span>
                        ) : job.state === 'running' && job.steps.length === 0 ? (
                          <span className="text-gray-500 text-xs animate-pulse">…</span>
                        ) : (
                          <StepBadge step={job.steps.find(s => s.name === name)} />
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-2.5 font-mono text-gray-400 text-xs">
                      {job.nameservers ? job.nameservers.join(', ') : (
                        job.state === 'running'
                          ? <span className="animate-pulse text-gray-600">…</span>
                          : <span className="text-gray-700">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Error details */}
          {jobs.some(j => j.state === 'error') && (
            <div className="mt-4 space-y-2">
              {jobs.filter(j => j.state === 'error').map(job => (
                <div key={job.id} className="px-4 py-3 bg-red-950/30 border border-red-900/50 rounded-lg">
                  <p className="text-sm font-mono text-red-300 font-medium mb-1">{job.domain}</p>
                  {job.steps.filter(s => s.status === 'error').map(s => (
                    <p key={s.name} className="text-xs text-red-400">{s.name}: {s.detail}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
