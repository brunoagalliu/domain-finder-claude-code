import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';
import { getOutboundIp } from '@/lib/outbound-ip';

const VERCEL_API = 'https://api.vercel.com';
const NC = 'https://api.namecheap.com/xml.response';
const VERCEL_A_RECORD = '76.76.21.21';

type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };

async function vfetch(path: string, method = 'GET', body?: object) {
  const res = await fetch(`${VERCEL_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

interface NcHost {
  name: string;
  type: string;
  address: string;
  mxPref: string;
  ttl: string;
}

function parseHosts(xml: string): NcHost[] {
  const hosts: NcHost[] = [];
  const regex = /<host[^>]+>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const tag = m[0];
    const get = (key: string) => tag.match(new RegExp(`${key}="([^"]*)"`, 'i'))?.[1] ?? '';
    const name = get('Name');
    const type = get('Type');
    if (!name || !type) continue;
    hosts.push({ name, type, address: get('Address'), mxPref: get('MXPref') || '10', ttl: get('TTL') || '1800' });
  }
  return hosts;
}

export async function POST(req: NextRequest) {
  const { domains } = await req.json() as { domains: string[] };

  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!projectId || !process.env.VERCEL_TOKEN) {
    return NextResponse.json({ error: 'VERCEL_TOKEN and VERCEL_PROJECT_ID must be set' }, { status: 500 });
  }

  const { NAMECHEAP_API_USER: apiUser, NAMECHEAP_API_KEY: apiKey, NAMECHEAP_USERNAME: username } = process.env;
  if (!apiUser || !apiKey || !username) {
    return NextResponse.json({ error: 'Namecheap credentials not configured' }, { status: 500 });
  }

  const clientIp = await getOutboundIp();
  const proxyFetch = makeProxyFetch();
  const results: { domain: string; steps: StepResult[] }[] = [];

  for (const domain of domains) {
    const steps: StepResult[] = [];
    const parts = domain.split('.');
    const sld = parts[0];
    const tld = parts.slice(1).join('.');

    // 1. Add domain to Vercel project
    const vercelRes = await vfetch(`/v9/projects/${projectId}/domains`, 'POST', { name: domain });
    if (vercelRes.error) {
      const msg: string = vercelRes.error.message ?? '';
      const alreadyExists = vercelRes.error.code === 'domain_already_in_project'
        || msg.toLowerCase().includes('already in use')
        || msg.toLowerCase().includes('already exists');
      if (alreadyExists) {
        steps.push({ name: 'Add to Vercel', status: 'ok', detail: 'Already in project' });
      } else {
        steps.push({ name: 'Add to Vercel', status: 'error', detail: msg });
        results.push({ domain, steps });
        continue;
      }
    } else {
      steps.push({ name: 'Add to Vercel', status: 'ok' });
    }

    // 2. Get current Namecheap DNS records
    const getParams = new URLSearchParams({
      ApiUser: apiUser, ApiKey: apiKey, UserName: username, ClientIp: clientIp,
      Command: 'namecheap.domains.dns.getHosts', SLD: sld, TLD: tld,
    });
    const getRes = await proxyFetch(`${NC}?${getParams}`);
    const getXml = await getRes.text();

    if (getXml.includes('Status="ERROR"')) {
      const err = getXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();
      steps.push({ name: 'Update DNS', status: 'error', detail: err ?? 'Could not fetch DNS records' });
      results.push({ domain, steps });
      continue;
    }

    // 3. Merge: keep existing records, replace any @ A record with Vercel's
    const existing = parseHosts(getXml).filter(h => !(h.name === '@' && h.type === 'A'));
    const newHosts: NcHost[] = [
      ...existing,
      { name: '@', type: 'A', address: VERCEL_A_RECORD, mxPref: '10', ttl: '1800' },
    ];

    // 4. Set all DNS records back
    const setParams = new URLSearchParams({
      ApiUser: apiUser, ApiKey: apiKey, UserName: username, ClientIp: clientIp,
      Command: 'namecheap.domains.dns.setHosts', SLD: sld, TLD: tld,
    });
    newHosts.forEach((h, i) => {
      const n = i + 1;
      setParams.set(`HostName${n}`, h.name);
      setParams.set(`RecordType${n}`, h.type);
      setParams.set(`Address${n}`, h.address);
      setParams.set(`MXPref${n}`, h.mxPref);
      setParams.set(`TTL${n}`, h.ttl);
    });

    const setRes = await proxyFetch(`${NC}?${setParams}`);
    const setXml = await setRes.text();
    const setOk = setXml.includes('IsSuccess="true"');
    const setErr = setXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();

    steps.push({
      name: 'Update DNS',
      status: setOk ? 'ok' : 'error',
      detail: setOk ? `@ → ${VERCEL_A_RECORD}` : setErr ?? 'Failed to set DNS records',
    });

    results.push({ domain, steps });
  }

  return NextResponse.json({ results });
}
