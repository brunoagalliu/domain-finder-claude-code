import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';
import { getOutboundIp } from '@/lib/outbound-ip';

const VERCEL_API = 'https://api.vercel.com';
const NC = 'https://api.namecheap.com/xml.response';
const VERCEL_NS = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'];
const VERCEL_A_FALLBACK = '76.76.21.21';

type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };
interface NcHost { name: string; type: string; address: string; mxPref: string; ttl: string; }

function parseHosts(xml: string): NcHost[] {
  const hosts: NcHost[] = [];
  const regex = /<host[^>]+>/gi;
  let m;
  while ((m = regex.exec(xml)) !== null) {
    const tag = m[0];
    const get = (k: string) => tag.match(new RegExp(`${k}="([^"]*)"`, 'i'))?.[1] ?? '';
    const name = get('Name'); const type = get('Type');
    if (!name || !type) continue;
    hosts.push({ name, type, address: get('Address'), mxPref: get('MXPref') || '10', ttl: get('TTL') || '1800' });
  }
  return hosts;
}

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
  const { domains, mode = 'nameservers' } = await req.json() as { domains: string[]; mode?: 'nameservers' | 'arecord' };

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

    // 2. Configure DNS in Namecheap
    if (mode === 'nameservers') {
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
    } else {
      // Fetch the current A record IP from Vercel's config API
      let aIp = VERCEL_A_FALLBACK;
      try {
        const configRes = await vfetch(`/v6/domains/${domain}/config`);
        if (configRes.aValues?.length) aIp = configRes.aValues[0];
      } catch { /* use fallback */ }

      // GET existing Namecheap hosts — if domain is on custom nameservers, reset to default first
      const getParams = new URLSearchParams({
        ApiUser: apiUser, ApiKey: apiKey, UserName: username, ClientIp: clientIp,
        Command: 'namecheap.domains.dns.getHosts', SLD: sld, TLD: tld,
      });
      let getXml = await (await proxyFetch(`${NC}?${getParams}`)).text();

      if (getXml.includes('Status="ERROR"')) {
        const errMsg = getXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim() ?? '';
        const isCustomNs = errMsg.toLowerCase().includes('custom')
          || errMsg.toLowerCase().includes('nameserver')
          || errMsg.toLowerCase().includes('dns server')
          || errMsg.toLowerCase().includes('proper dns')
          || errMsg.toLowerCase().includes('not using');

        if (!isCustomNs) {
          steps.push({ name: 'Set A record', status: 'error', detail: errMsg || 'Could not fetch DNS records' });
          results.push({ domain, steps });
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        // Reset to Namecheap default nameservers so we can manage DNS records
        const resetParams = new URLSearchParams({
          ApiUser: apiUser, ApiKey: apiKey, UserName: username, ClientIp: clientIp,
          Command: 'namecheap.domains.dns.setDefault', SLD: sld, TLD: tld,
        });
        const resetXml = await (await proxyFetch(`${NC}?${resetParams}`)).text();
        const resetOk = resetXml.includes('Update="true"') || (resetXml.includes('Status="OK"') && !resetXml.includes('Status="ERROR"'));
        const resetErr = resetXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();

        steps.push({ name: 'Reset to Namecheap DNS', status: resetOk ? 'ok' : 'error', detail: resetErr });

        if (!resetOk) {
          results.push({ domain, steps });
          await new Promise(r => setTimeout(r, 500));
          continue;
        }

        // Re-fetch hosts now that we're back on Namecheap DNS
        getXml = await (await proxyFetch(`${NC}?${getParams}`)).text();
        if (getXml.includes('Status="ERROR"')) {
          const err2 = getXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();
          steps.push({ name: 'Set A record', status: 'error', detail: err2 ?? 'Could not fetch DNS records after reset' });
          results.push({ domain, steps });
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
      }

      const existing = parseHosts(getXml).filter(h => !(h.name === '@' && h.type === 'A'));
      const newHosts = [...existing, { name: '@', type: 'A', address: aIp, mxPref: '10', ttl: '1800' }];

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

      const setXml = await (await proxyFetch(`${NC}?${setParams}`)).text();
      const setOk = setXml.includes('IsSuccess="true"');
      const setErr = setXml.match(/<Error[^>]*>([^<]+)<\/Error>/)?.[1]?.trim();
      steps.push({
        name: 'Set A record',
        status: setOk ? 'ok' : 'error',
        detail: setOk ? `@ → ${aIp}` : setErr ?? 'Failed to set A record',
      });
    }

    results.push({ domain, steps });
    await new Promise(r => setTimeout(r, 500));
  }

  return NextResponse.json({ results });
}
