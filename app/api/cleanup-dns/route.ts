import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';

const CF_BASE = 'https://api.cloudflare.com/client/v4';

async function cfetch(path: string, method = 'GET', body?: unknown) {
  const proxyFetch = makeProxyFetch();
  const res = await proxyFetch(`${CF_BASE}${path}`, {
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
  const { domains, ip } = await req.json();
  if (!domains?.length || !ip) {
    return NextResponse.json({ error: 'domains and ip required' }, { status: 400 });
  }

  const results: { domain: string; status: 'deleted' | 'not_found' | 'error'; detail?: string }[] = [];

  for (const domain of domains) {
    try {
      const zoneRes = await cfetch(`/zones?name=${domain}`);
      const zoneId = zoneRes.result?.[0]?.id;
      if (!zoneId) {
        results.push({ domain, status: 'error', detail: 'Zone not found in Cloudflare' });
        continue;
      }

      const recordsRes = await cfetch(`/zones/${zoneId}/dns_records?type=A&content=${ip}`);
      const records = recordsRes.result ?? [];

      if (records.length === 0) {
        results.push({ domain, status: 'not_found' });
        continue;
      }

      let deleted = false;
      for (const record of records) {
        const del = await cfetch(`/zones/${zoneId}/dns_records/${record.id}`, 'DELETE');
        if (del.success) deleted = true;
      }

      results.push({ domain, status: deleted ? 'deleted' : 'error', detail: deleted ? undefined : 'Delete failed' });
    } catch (e) {
      results.push({ domain, status: 'error', detail: String(e) });
    }
  }

  return NextResponse.json({ results });
}
