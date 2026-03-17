import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';

const CF = 'https://api.cloudflare.com/client/v4';
const NC = 'https://api.namecheap.com/xml.response';

type StepResult = { name: string; status: 'ok' | 'error'; detail?: string };

async function cfetch(path: string, method: string, body?: object) {
  const res = await fetch(`${CF}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

export async function POST(req: NextRequest) {
  const { domain, ip } = await req.json();
  const steps: StepResult[] = [];

  // 1. Add zone to Cloudflare
  let zoneId: string;
  let nameservers: string[];

  const zoneRes = await cfetch('/zones', 'POST', {
    name: domain,
    type: 'full',
    account: { id: process.env.CLOUDFLARE_ACCOUNT_ID },
  });

  if (zoneRes.success) {
    zoneId = zoneRes.result.id;
    nameservers = zoneRes.result.name_servers;
    steps.push({ name: 'Add to Cloudflare', status: 'ok' });
  } else {
    const alreadyExists = zoneRes.errors?.some(
      (e: { code: number; message?: string }) =>
        e.code === 1049 || e.code === 1061 || e.code === 1097 ||
        e.message?.toLowerCase().includes('already')
    );
    if (alreadyExists) {
      const existing = await cfetch(`/zones?name=${domain}`, 'GET');
      if (!existing.success || !existing.result?.[0]) {
        steps.push({ name: 'Add to Cloudflare', status: 'error', detail: 'Zone exists but could not be fetched' });
        return NextResponse.json({ steps }, { status: 500 });
      }
      zoneId = existing.result[0].id;
      // Fetch full zone details to ensure name_servers is populated
      const zoneDetail = await cfetch(`/zones/${zoneId}`, 'GET');
      nameservers = zoneDetail.result?.name_servers ?? existing.result[0].name_servers ?? [];
      console.log('[provision] existing zone nameservers:', nameservers);
      steps.push({ name: 'Add to Cloudflare', status: 'ok', detail: 'Zone already existed' });
    } else {
      steps.push({ name: 'Add to Cloudflare', status: 'error', detail: zoneRes.errors?.[0]?.message });
      return NextResponse.json({ steps }, { status: 500 });
    }
  }

  // 2. Add A record (proxy off)
  const dnsRes = await cfetch(`/zones/${zoneId}/dns_records`, 'POST', {
    type: 'A',
    name: domain,
    content: ip,
    ttl: 1,
    proxied: false,
  });

  if (dnsRes.success) {
    steps.push({ name: 'Add A record', status: 'ok' });
  } else {
    const duplicate = dnsRes.errors?.some(
      (e: { code: number; message?: string }) =>
        e.code === 81057 || e.message?.toLowerCase().includes('already')
    );
    steps.push({
      name: 'Add A record',
      status: duplicate ? 'ok' : 'error',
      detail: duplicate ? 'Record already exists' : dnsRes.errors?.[0]?.message,
    });
    if (!duplicate) return NextResponse.json({ steps }, { status: 500 });
  }

  // 3. Enable Bot Fight Mode + AI Labyrinth + crawler protection
  const botRes = await cfetch(`/zones/${zoneId}/bot_management`, 'PUT', {
    fight_mode: true,
    enable_js: true,
    crawler_protection: 'enabled',
    ai_bots_protection: 'block',
  });

  steps.push({
    name: 'Enable security',
    status: botRes.success ? 'ok' : 'error',
    detail: botRes.success ? 'Bot Fight Mode + AI Labyrinth' : botRes.errors?.[0]?.message,
  });

  // 4. Set Cloudflare nameservers in Namecheap
  const parts = domain.split('.');
  const sld = parts[0];
  const tld = parts.slice(1).join('.');

  const params = new URLSearchParams({
    ApiUser: process.env.NAMECHEAP_API_USER!,
    ApiKey: process.env.NAMECHEAP_API_KEY!,
    UserName: process.env.NAMECHEAP_USERNAME!,
    ClientIp: process.env.NAMECHEAP_CLIENT_IP!,
    Command: 'namecheap.domains.dns.setCustom',
    SLD: sld,
    TLD: tld,
  });
  params.set('Nameservers', nameservers.join(','));

  const proxyFetch = makeProxyFetch();
  const nsRes = await proxyFetch(`${NC}?${params}`);
  const nsXml = await nsRes.text();
  const nsOk = nsXml.includes('Update="true"') || (nsXml.includes('Status="OK"') && !nsXml.includes('Status="ERROR"'));
  console.log('[provision] namecheap NS xml:', nsXml.slice(0, 400));
  const nsErrorMatch = nsXml.match(/<Error[^>]*>([^<]+)<\/Error>/);
  const nsErrorMsg = nsErrorMatch ? nsErrorMatch[1].trim() : nsXml.slice(0, 200);

  steps.push({
    name: 'Set nameservers',
    status: nsOk ? 'ok' : 'error',
    detail: nsOk ? nameservers.join(', ') : nsErrorMsg,
  });

  return NextResponse.json({ nameservers, steps });
}
