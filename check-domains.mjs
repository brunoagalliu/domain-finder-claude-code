#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';

const NAMECHEAP_API_URL = 'https://api.namecheap.com/xml.response';

async function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, answer => { rl.close(); resolve(answer); }));
}

async function checkDomains(domains) {
  const { NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, NAMECHEAP_CLIENT_IP } = process.env;

  if (!NAMECHEAP_API_USER || !NAMECHEAP_API_KEY || !NAMECHEAP_USERNAME || !NAMECHEAP_CLIENT_IP) {
    console.error('Missing env vars. Required: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, NAMECHEAP_CLIENT_IP');
    process.exit(1);
  }

  const domainList = domains.map(d => d.endsWith('.com') ? d : `${d}.com`).join(',');

  const params = new URLSearchParams({
    ApiUser: NAMECHEAP_API_USER,
    ApiKey: NAMECHEAP_API_KEY,
    UserName: NAMECHEAP_USERNAME,
    ClientIp: NAMECHEAP_CLIENT_IP,
    Command: 'namecheap.domains.check',
    DomainList: domainList
  });

  const response = await fetch(`${NAMECHEAP_API_URL}?${params}`);
  const xml = await response.text();

  const results = [];
  const domainRegex = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"(?:\s+IsPremiumName="([^"]+)")?(?:\s+PremiumRegistrationPrice="([^"]+)")?/g;

  let match;
  while ((match = domainRegex.exec(xml)) !== null) {
    results.push({
      domain: match[1],
      available: match[2] === 'true',
      isPremium: match[3] === 'true',
      price: match[4] || null
    });
  }

  if (xml.includes('<Error')) {
    const errorMatch = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
    if (errorMatch) {
      console.error('Namecheap API Error:', errorMatch[1]);
      process.exit(1);
    }
  }

  return results;
}

// CLI
const { positionals } = parseArgs({ allowPositionals: true });

if (positionals.length === 0) {
  console.log('Usage: node check-domains.mjs domain1 domain2 ...');
  console.log('Example: node check-domains.mjs coolstartup awesomeapp myproject');
  process.exit(0);
}

// Ask for filename
const filename = await prompt('Save results to (e.g. "pharma-ideas"): ');
const resultsDir = 'results';
if (!existsSync(resultsDir)) mkdirSync(resultsDir);
const filepath = `${resultsDir}/${filename || 'search'}-${Date.now()}.txt`;

const results = await checkDomains(positionals);

console.log('\nDomain Availability Results:\n');
const lines = [];
for (const r of results) {
  const status = r.available ? '✓ Available' : '✗ Taken';
  const statusColored = r.available ? '\x1b[32m✓ Available\x1b[0m' : '\x1b[31m✗ Taken\x1b[0m';
  const premium = r.isPremium ? ` (Premium: $${r.price})` : '';
  console.log(`${r.domain.padEnd(30)} ${statusColored}${premium}`);
  lines.push(`${r.domain.padEnd(30)} ${status}${premium}`);
}

// Save to file
const available = results.filter(r => r.available);
const output = `# Domain Search Results - ${new Date().toISOString()}
# Query: ${positionals.join(', ')}

## All Results
${lines.join('\n')}

## Available Domains
${available.length ? available.map(r => r.domain).join('\n') : 'None found'}
`;

writeFileSync(filepath, output);
console.log(`\nResults saved to: ${filepath}`);
