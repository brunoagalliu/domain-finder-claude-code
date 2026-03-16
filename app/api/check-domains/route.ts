import { NextRequest, NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';

const NAMECHEAP_API_URL = 'https://api.namecheap.com/xml.response';

export async function POST(req: NextRequest) {
  const { domains } = await req.json();

  if (!Array.isArray(domains) || domains.length === 0) {
    return NextResponse.json({ error: 'domains array is required' }, { status: 400 });
  }

  const { NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, NAMECHEAP_CLIENT_IP } = process.env;

  if (!NAMECHEAP_API_USER || !NAMECHEAP_API_KEY || !NAMECHEAP_USERNAME || !NAMECHEAP_CLIENT_IP) {
    return NextResponse.json({ error: 'Namecheap API credentials not configured' }, { status: 500 });
  }

  const domainList = domains
    .map((d: string) => (d.endsWith('.com') ? d : `${d}.com`))
    .join(',');

  const params = new URLSearchParams({
    ApiUser: NAMECHEAP_API_USER,
    ApiKey: NAMECHEAP_API_KEY,
    UserName: NAMECHEAP_USERNAME,
    ClientIp: NAMECHEAP_CLIENT_IP,
    Command: 'namecheap.domains.check',
    DomainList: domainList,
  });

  const proxyFetch = makeProxyFetch();
  const response = await proxyFetch(`${NAMECHEAP_API_URL}?${params}`);
  const xml = await response.text();

  if (xml.includes('Status="ERROR"')) {
    const errorMatch = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
    const msg = errorMatch ? errorMatch[1] : 'Unknown Namecheap error';
    console.error('[check-domains] Namecheap error:', msg);
    return NextResponse.json({ error: `Namecheap: ${msg}` }, { status: 502 });
  }

  const results: { domain: string; available: boolean; isPremium: boolean; price: string | null }[] = [];
  const domainRegex = /<DomainCheckResult\s+Domain="([^"]+)"\s+Available="([^"]+)"(?:\s+IsPremiumName="([^"]+)")?(?:\s+PremiumRegistrationPrice="([^"]+)")?/g;

  let match;
  while ((match = domainRegex.exec(xml)) !== null) {
    results.push({
      domain: match[1],
      available: match[2] === 'true',
      isPremium: match[3] === 'true',
      price: match[4] || null,
    });
  }

  return NextResponse.json({ results });
}
