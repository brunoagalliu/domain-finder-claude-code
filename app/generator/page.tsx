'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
const BATCH_SIZE = 50;
const TLDS = ['.com', '.net', '.org', '.io', '.co', '.app', '.dev'];

function randomName(length: number) {
  let name = '';
  for (let i = 0; i < length; i++) name += CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)];
  return name;
}

function generateBatch(seen: Set<string>, length: number, tld: string): string[] {
  const batch: string[] = [];
  while (batch.length < BATCH_SIZE) {
    const d = `${randomName(length)}${tld}`;
    if (!seen.has(d)) { seen.add(d); batch.push(d); }
  }
  return batch;
}

export default function GeneratorPage() {
  const [target, setTarget] = useState(50);
  const [length, setLength] = useState(6);
  const [tld, setTld] = useState('.com');
  const [available, setAvailable] = useState<string[]>([]);
  const [checked, setChecked] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const stopRef = useRef(false);
  const seenRef = useRef<Set<string>>(new Set());

  async function handleStart() {
    stopRef.current = false;
    seenRef.current = new Set();
    setAvailable([]);
    setChecked(0);
    setDone(false);
    setRunning(true);

    let found: string[] = [];

    while (found.length < target && !stopRef.current) {
      const batch = generateBatch(seenRef.current, length, tld);

      try {
        const res = await fetch('/api/check-domains', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domains: batch }),
        });
        const data = await res.json();
        if (!res.ok) break;

        const newAvailable = (data.results as { domain: string; available: boolean }[])
          .filter(r => r.available)
          .map(r => r.domain);

        found = [...found, ...newAvailable].slice(0, target);
        setAvailable([...found]);
        setChecked(prev => prev + batch.length);
      } catch {
        break;
      }
    }

    setRunning(false);
    setDone(true);
  }

  function handleStop() {
    stopRef.current = true;
  }

  function handleCopy() {
    navigator.clipboard.writeText(available.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const progress = Math.min((available.length / target) * 100, 100);

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Domain Generator</h1>
          <p className="text-gray-400 mt-1 text-sm">Find available consonant-only domains at scale.</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mt-1">
          ← Domain Finder
        </Link>
      </div>

      {/* Settings */}
      <div className="grid grid-cols-3 gap-4 mb-8 p-4 bg-gray-900 border border-gray-800 rounded-lg">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Target count</label>
          <input
            type="number"
            min={1}
            max={500}
            value={target}
            onChange={e => setTarget(Math.max(1, Math.min(500, parseInt(e.target.value) || 1)))}
            disabled={running}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Letters</label>
          <input
            type="number"
            min={3}
            max={12}
            value={length}
            onChange={e => setLength(Math.max(3, Math.min(12, parseInt(e.target.value) || 3)))}
            disabled={running}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">TLD</label>
          <select
            value={tld}
            onChange={e => setTld(e.target.value)}
            disabled={running}
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-gray-100 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          >
            {TLDS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-8">
        {!running ? (
          <button
            onClick={handleStart}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {done ? 'Run again' : `Find ${target} available domains`}
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="px-5 py-2.5 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
        )}
        {available.length > 0 && (
          <button
            onClick={handleCopy}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-colors"
          >
            {copied ? 'Copied!' : 'Copy all'}
          </button>
        )}
      </div>

      {/* Progress */}
      {(running || done) && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
            <span>{available.length} / {target} found</span>
            <span>{checked.toLocaleString()} domains checked</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Results */}
      {available.length > 0 && (
        <div className="border border-gray-800 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Available domains</span>
            {running && <span className="text-xs text-indigo-400 animate-pulse">Searching…</span>}
          </div>
          <div className="grid grid-cols-3 divide-x divide-y divide-gray-800/50">
            {available.map((d, i) => (
              <div
                key={d}
                className={`px-4 py-2.5 flex items-center gap-2 ${i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-900/50'}`}
              >
                <span className="text-emerald-400 text-xs">✓</span>
                <span className="font-mono text-sm text-white">{d}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
