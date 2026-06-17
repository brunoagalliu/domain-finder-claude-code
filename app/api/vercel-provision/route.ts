import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';
import { getOutboundIp } from '@/lib/outbound-ip';

const VERCEL_API = 'https://api.vercel.com';
const NC = 'https://api.namecheap.com/xml.response';
const VERCEL_NS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];

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

    // 2. Set Vercel nameservers in Namecheap
    const params = new URLSearchParams({
      ApiUser: apiUser, ApiKey: apiKey, UserName: username, ClientIp: clientIp,
      Command: 'namecheap.domains.dns.setCustom',
      SLD: sld, TLD: tld,
      Nameservers: VERCEL_NS.join(','),
    });

    const nsRes = await proxyFetch(`${NC}?${params}`);
    const nsXml = await nsRes.text();
    const nsOk = nsXml.includes('Update="true"') || (nsXml.includes('Status="OK"') && !nsXml.includes('Status="ERROR"'));
    const nsErr = nsXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim() ?? nsXml.slice(0, 200);

    steps.push({
      name: 'Set nameservers',
      status: nsOk ? 'ok' : 'error',
      detail: nsOk ? VERCEL_NS.join(', ') : nsErr,
    });

    results.push({ domain, steps });
  }

  return NextResponse.json({ results });
}
