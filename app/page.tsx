'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Tier = 'top' | 'strong' | 'wildcard';

type Suggestion = {
  domain: string;
  strategy: string;
  rationale: string;
  tier: Tier;
};

type DomainResult = {
  domain: string;
  available: boolean;
  isPremium: boolean;
  price: string | null;
};

type HistoryEntry = {
  id: string;
  timestamp: number;
  description: string;
  available: string[];
  taken: string[];
};

const TIER_CONFIG: Record<Tier, { label: string; badge: string }> = {
  top:      { label: 'Top Picks',  badge: 'bg-amber-950 text-amber-400'   },
  strong:   { label: 'Strong',     badge: 'bg-indigo-950 text-indigo-400' },
  wildcard: { label: 'Wildcards',  badge: 'bg-gray-800 text-gray-400'     },
};

const TIERS: Tier[] = ['top', 'strong', 'wildcard'];

function saveHistory(entry: HistoryEntry) {
  try {
    const existing: HistoryEntry[] = JSON.parse(localStorage.getItem('domain-history') || '[]');
    existing.unshift(entry);
    localStorage.setItem('domain-history', JSON.stringify(existing.slice(0, 20)));
  } catch {}
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem('domain-history') || '[]');
  } catch {
    return [];
  }
}

function clearHistory() {
  try { localStorage.removeItem('domain-history'); } catch {}
}

function HistoryPanel({ history, onClear }: { history: HistoryEntry[]; onClear: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyAvailable(id: string, domains: string[]) {
    navigator.clipboard.writeText(domains.join('\n'));
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <section className="mb-8 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wide">Past searches</h2>
        <button
          onClick={onClear}
          className="text-xs text-gray-600 hover:text-red-400 transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="divide-y divide-gray-800/50">
        {history.map(h => {
          const isOpen = expanded.has(h.id);
          const available = h.available ?? [];
          const taken = h.taken ?? [];
          const total = available.length + taken.length;
          return (
            <div key={h.id} className="bg-gray-900/50">
              {/* Summary row — click to expand */}
              <button
                onClick={() => toggle(h.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-gray-200 leading-snug">{h.description}</p>
                  <span className="text-gray-600 text-xs mt-0.5 flex-shrink-0">{isOpen ? '▲' : '▼'}</span>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="text-xs text-gray-500">{new Date(h.timestamp).toLocaleString()}</span>
                  <span className="text-xs text-emerald-400 font-medium">{available.length} available</span>
                  <span className="text-xs text-gray-600">{total} checked</span>
                </div>
              </button>

              {/* Expanded detail */}
              {isOpen && (
                <div className="px-4 pb-4 border-t border-gray-800/50">
                  {available.length > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Available</p>
                        <button
                          onClick={() => copyAvailable(h.id, available)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {copied === h.id ? 'Copied!' : 'Copy all'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {available.map(d => (
                          <span key={d} className="font-mono text-xs text-white bg-emerald-950/40 border border-emerald-900/50 px-2 py-1 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {taken.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-2">Taken</p>
                      <div className="flex flex-wrap gap-1.5">
                        {taken.map(d => (
                          <span key={d} className="font-mono text-xs text-gray-600 bg-gray-800/50 px-2 py-1 rounded">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  const [description, setDescription] = useState('');
  const [brainstorming, setBrainstorming] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const router = useRouter();

  useEffect(() => { setHistory(loadHistory()); }, []);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  function handleClearHistory() {
    clearHistory();
    setHistory([]);
    setShowHistory(false);
  }

  async function handleBrainstorm() {
    if (!description.trim()) return;
    setBrainstorming(true);
    setError('');
    setSuggestions([]);
    setSelected(new Set());
    setResults([]);

    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Brainstorm failed');
      setSuggestions(data.suggestions);
      setSelected(new Set(data.suggestions.map((s: Suggestion) => s.domain)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBrainstorming(false);
    }
  }

  function toggleDomain(domain: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === suggestions.length) setSelected(new Set());
    else setSelected(new Set(suggestions.map(s => s.domain)));
  }

  async function handleCheck() {
    if (selected.size === 0) return;
    setChecking(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch('/api/check-domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Availability check failed');
      setResults(data.results);

      const entry: HistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        description,
        available: data.results.filter((r: DomainResult) => r.available).map((r: DomainResult) => r.domain),
        taken: data.results.filter((r: DomainResult) => !r.available).map((r: DomainResult) => r.domain),
      };
      saveHistory(entry);
      setHistory(loadHistory());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setChecking(false);
    }
  }

  const available = results.filter(r => r.available);
  const taken = results.filter(r => !r.available);

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Domain Finder</h1>
          <p className="text-gray-400 mt-1 text-sm">Describe your business, get AI-generated domain ideas, check availability.</p>
        </div>
        <div className="flex items-center gap-4 mt-1">
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(h => !h)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {showHistory ? 'Hide history' : `History (${history.length})`}
            </button>
          )}
          <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && history.length > 0 && (
        <HistoryPanel history={history} onClear={handleClearHistory} />
      )}

      {/* Step 1: Brainstorm */}
      <section className="mb-8">
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Describe your business or project
        </label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. A SaaS platform that helps sales teams qualify and route inbound leads automatically..."
          rows={3}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none text-sm"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleBrainstorm(); }}
        />
        <button
          onClick={handleBrainstorm}
          disabled={brainstorming || !description.trim()}
          className="mt-3 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {brainstorming ? 'Brainstorming...' : 'Brainstorm with Claude'}
        </button>
      </section>

      {/* Error */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Step 2: Select domains by tier */}
      {suggestions.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-gray-300">
              Domain Ideas <span className="text-gray-500">({suggestions.length})</span>
            </h2>
            <button onClick={toggleAll} className="text-xs text-indigo-400 hover:text-indigo-300">
              {selected.size === suggestions.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          <div className="space-y-4">
            {TIERS.map(tier => {
              const group = suggestions.filter(s => s.tier === tier);
              if (group.length === 0) return null;
              const cfg = TIER_CONFIG[tier];
              return (
                <div key={tier}>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1.5 px-1">
                    {cfg.label}
                  </p>
                  <div className="border border-gray-800 rounded-lg overflow-hidden">
                    {group.map((s, i) => (
                      <label
                        key={s.domain}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-800 ${
                          i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(s.domain)}
                          onChange={() => toggleDomain(s.domain)}
                          className="mt-0.5 accent-indigo-500 w-4 h-4 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-mono text-white text-sm">{s.domain}.com</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded ${cfg.badge}`}>{s.strategy}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{s.rationale}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <button
            onClick={handleCheck}
            disabled={checking || selected.size === 0}
            className="mt-5 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {checking
              ? 'Checking...'
              : `Check Availability (${selected.size} domain${selected.size !== 1 ? 's' : ''})`}
          </button>
        </section>
      )}

      {/* Step 3: Results */}
      {results.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-300 mb-4">
            Results <span className="text-gray-500">— {available.length} available, {taken.length} taken</span>
          </h2>

          {available.length > 0 && (
            <div className="mb-6">
              <p className="text-xs text-emerald-400 font-semibold mb-2 uppercase tracking-widest">Available</p>
              <div className="grid gap-2">
                {available.map(r => (
                  <div key={r.domain} className="flex items-center justify-between px-4 py-3 bg-emerald-950/20 border border-emerald-900/50 rounded-lg">
                    <span className="font-mono text-white font-medium">{r.domain}</span>
                    <div className="flex items-center gap-3">
                      {r.isPremium && r.price && (
                        <span className="text-xs text-yellow-400">Premium ${r.price}</span>
                      )}
                      <span className="text-xs font-semibold text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded">Available</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taken.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 font-semibold mb-2 uppercase tracking-widest">Taken</p>
              <div className="border border-gray-800 rounded-lg overflow-hidden">
                {taken.map((r, i) => (
                  <div
                    key={r.domain}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                    }`}
                  >
                    <span className="font-mono text-gray-500 text-sm">{r.domain}</span>
                    <span className="text-xs text-gray-600">Taken</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
