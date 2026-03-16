import { ProxyAgent, fetch as undiciFetch } from 'undici';

// Returns a fetch function that routes through FIXIE_URL (or HTTPS_PROXY) if set.
// Use this anywhere you need outbound requests with a static IP for Vercel.
export function makeProxyFetch() {
  const proxyUrl = process.env.FIXIE_URL || process.env.HTTPS_PROXY;
  if (!proxyUrl) return fetch;

  const agent = new ProxyAgent(proxyUrl);
  return (url: string | URL | Request, init?: RequestInit) =>
    undiciFetch(url as string, {
      ...(init as object),
      dispatcher: agent,
    }) as unknown as Promise<Response>;
}
