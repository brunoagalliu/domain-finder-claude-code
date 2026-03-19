import { NextResponse } from 'next/server';
import { makeProxyFetch } from '@/lib/proxy-fetch';

const NC = 'https://api.namecheap.com/xml.response';

export type NamecheapDomain = {
  name: string;
  isOurDNS: boolean;
  expires: string;
  created: string;
};

function parseDomainsFromXml(xml: string): NamecheapDomain[] {
  // Match full <Domain ... /> tags (dates like 02/10/2020 contain slashes, so we can't use [^/])
  const tags = [...xml.matchAll(/<Domain\s[\s\S]*?\/>/g)];
  return tags.map(m => {
    const tag = m[0];
    const get = (key: string) => (tag.match(new RegExp(`${key}="([^"]*)"`)))?.[1] ?? '';
    return {
      name: get('Name').toLowerCase(),
      isOurDNS: get('IsOurDNS') === 'true',
      expires: get('Expires'),
      created: get('Created'),
    };
  }).filter(d => d.name);
}

export async function GET() {
  const proxyFetch = makeProxyFetch();
  const base = {
    ApiUser: process.env.NAMECHEAP_API_USER!,
    ApiKey: process.env.NAMECHEAP_API_KEY!,
    UserName: process.env.NAMECHEAP_USERNAME!,
    ClientIp: process.env.NAMECHEAP_CLIENT_IP!,
    Command: 'namecheap.domains.getList',
    PageSize: '100',
  };

  const allDomains: NamecheapDomain[] = [];
  let page = 1;
  let total = Infinity;

  while (allDomains.length < total) {
    const params = new URLSearchParams({ ...base, Page: String(page) });
    const res = await proxyFetch(`${NC}?${params}`);
    const xml = await res.text();

    if (xml.includes('Status="ERROR"')) {
      const errMatch = xml.match(/<Error[^>]*>([^<]+)<\/Error>/);
      return NextResponse.json({ error: errMatch?.[1]?.trim() ?? 'Namecheap error' }, { status: 502 });
    }

    const totalMatch = xml.match(/<TotalItems>(\d+)<\/TotalItems>/);
    if (totalMatch) total = parseInt(totalMatch[1]);

    const domains = parseDomainsFromXml(xml);
    if (domains.length === 0) break;
    allDomains.push(...domains);
    page++;
  }

  return NextResponse.json({ domains: allDomains, total: allDomains.length });
}
