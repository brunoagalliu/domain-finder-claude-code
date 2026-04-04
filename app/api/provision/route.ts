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

type SecuritySettings = { botFightMode?: boolean; aiLabyrinth?: boolean; aiBotsProtection?: boolean };

export async function POST(req: NextRequest) {
  const { domain, ip, security = {} as SecuritySettings, network = { proxy: false, sslMode: 'none' } } = await req.json();
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
    proxied: !!network.proxy,
  });

  if (dnsRes.success) {
    steps.push({ name: 'Add A record', status: 'ok' });
  } else {
    const duplicate = dnsRes.errors?.some(
      (e: { code: number; message?: string }) =>
        e.code === 81057 || e.message?.toLowerCase().includes('already')
    );
    if (duplicate) {
      // Record exists — fetch it and update proxy/IP in case they changed
      const existing = await cfetch(`/zones/${zoneId}/dns_records?type=A&name=${domain}`, 'GET');
      const recordId = existing.result?.[0]?.id;
      if (recordId) {
        const patchRes = await cfetch(`/zones/${zoneId}/dns_records/${recordId}`, 'PATCH', {
          content: ip,
          proxied: !!network.proxy,
          ttl: 1,
        });
        steps.push({
          name: 'Add A record',
          status: patchRes.success ? 'ok' : 'error',
          detail: patchRes.success ? 'Updated existing record' : patchRes.errors?.[0]?.message,
        });
        if (!patchRes.success) return NextResponse.json({ steps }, { status: 500 });
      } else {
        steps.push({ name: 'Add A record', status: 'ok', detail: 'Record already exists' });
      }
    } else {
      steps.push({ name: 'Add A record', status: 'error', detail: dnsRes.errors?.[0]?.message });
      return NextResponse.json({ steps }, { status: 500 });
    }
  }

  // 3. Apply security settings (each as a separate call to avoid plan-level rejections)
  const anySecurityEnabled = security.botFightMode || security.aiLabyrinth || security.aiBotsProtection;
  if (anySecurityEnabled) {
    const body = {
      ...(security.botFightMode     ? { fight_mode: true, enable_js: true } : {}),
      ...(security.aiLabyrinth      ? { crawler_protection: 'enabled' }     : {}),
      ...(security.aiBotsProtection ? { ai_bots_protection: 'block' }       : {}),
    };
    const r = await cfetch(`/zones/${zoneId}/bot_management`, 'PUT', body);
    console.log('[provision] bot_management:', JSON.stringify(r));
    steps.push({
      name: 'Enable security',
      status: r.success ? 'ok' : 'error',
      detail: r.success
        ? [security.botFightMode && 'Bot Fight Mode', security.aiLabyrinth && 'AI Labyrinth', security.aiBotsProtection && 'AI Bots Protection'].filter(Boolean).join(', ')
        : r.errors?.[0]?.message,
    });
  }

  // 4. Set SSL/TLS mode
  if (network.sslMode && network.sslMode !== 'none') {
    const sslRes = await cfetch(`/zones/${zoneId}/settings/ssl`, 'PATCH', { value: network.sslMode });
    steps.push({
      name: 'Set SSL/TLS',
      status: sslRes.success ? 'ok' : 'error',
      detail: sslRes.success ? network.sslMode : sslRes.errors?.[0]?.message,
    });
  }

  // 5. Set Cloudflare nameservers in Namecheap
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
