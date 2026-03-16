'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Suggestion = {
  domain: string;
  strategy: string;
  rationale: string;
};

type DomainResult = {
  domain: string;
  available: boolean;
  isPremium: boolean;
  price: string | null;
};

export default function Home() {
  const [description, setDescription] = useState('');
  const [brainstorming, setBrainstorming] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [error, setError] = useState('');
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
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
    if (selected.size === suggestions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(suggestions.map(s => s.domain)));
    }
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
          <p className="text-gray-400 mt-1">Describe your business, get AI-generated domain ideas, check availability.</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs text-gray-500 hover:text-gray-300 mt-1 transition-colors"
        >
          Sign out
        </button>
      </div>

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

      {/* Step 2: Select domains */}
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

          <div className="space-y-1 border border-gray-800 rounded-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <label
                key={s.domain}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                  i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                } hover:bg-gray-800`}
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
                    <span className="text-xs text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded">{s.strategy}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{s.rationale}</p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleCheck}
            disabled={checking || selected.size === 0}
            className="mt-4 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
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
          <h2 className="text-sm font-medium text-gray-300 mb-3">
            Results <span className="text-gray-500">— {available.length} available, {taken.length} taken</span>
          </h2>

          {available.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-emerald-400 font-medium mb-2 uppercase tracking-wide">Available</p>
              <div className="space-y-1 border border-emerald-900 rounded-lg overflow-hidden">
                {available.map((r, i) => (
                  <div
                    key={r.domain}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      i % 2 === 0 ? 'bg-emerald-950/30' : 'bg-emerald-950/10'
                    }`}
                  >
                    <span className="font-mono text-white text-sm">{r.domain}</span>
                    <div className="flex items-center gap-2">
                      {r.isPremium && r.price && (
                        <span className="text-xs text-yellow-400">Premium ${r.price}</span>
                      )}
                      <span className="text-xs text-emerald-400 font-medium">Available</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taken.length > 0 && (
            <div>
              <p className="text-xs text-red-400 font-medium mb-2 uppercase tracking-wide">Taken</p>
              <div className="space-y-1 border border-gray-800 rounded-lg overflow-hidden">
                {taken.map((r, i) => (
                  <div
                    key={r.domain}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'
                    }`}
                  >
                    <span className="font-mono text-gray-500 text-sm">{r.domain}</span>
                    <span className="text-xs text-red-500">Taken</span>
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
