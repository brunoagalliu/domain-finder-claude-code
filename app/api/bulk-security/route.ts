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

type SecurityAction = { botFightMode?: boolean; aiLabyrinth?: boolean; aiBotsProtection?: boolean };

export async function POST(req: NextRequest) {
  const { domains, action }: { domains: string[]; action: SecurityAction } = await req.json();
  if (!domains?.length) return NextResponse.json({ error: 'domains required' }, { status: 400 });

  const body = {
    ...(action.botFightMode !== undefined ? { fight_mode: action.botFightMode, enable_js: action.botFightMode } : {}),
    ...(action.aiLabyrinth !== undefined ? { crawler_protection: action.aiLabyrinth ? 'enabled' : 'disabled' } : {}),
    ...(action.aiBotsProtection !== undefined ? { ai_bots_protection: action.aiBotsProtection ? 'block' : 'disabled' } : {}),
  };

  const results: { domain: string; status: 'ok' | 'error'; detail?: string }[] = [];

  for (const domain of domains) {
    try {
      const zoneRes = await cfetch(`/zones?name=${domain}`);
      const zoneId = zoneRes.result?.[0]?.id;
      if (!zoneId) { results.push({ domain, status: 'error', detail: 'Zone not found' }); continue; }

      const r = await cfetch(`/zones/${zoneId}/bot_management`, 'PUT', body);
      results.push({ domain, status: r.success ? 'ok' : 'error', detail: r.success ? undefined : r.errors?.[0]?.message });
    } catch (e) {
      results.push({ domain, status: 'error', detail: String(e) });
    }
  }

  return NextResponse.json({ results });
}
