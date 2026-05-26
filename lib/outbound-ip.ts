// Resolves the server's current outbound IP, cached for the process lifetime.
// Used as ClientIp for Namecheap API calls when NAMECHEAP_CLIENT_IP is not set.
let cached: string | null = null;

export async function getOutboundIp(): Promise<string> {
  if (process.env.NAMECHEAP_CLIENT_IP) return process.env.NAMECHEAP_CLIENT_IP;
  if (cached) return cached;
  const res = await fetch('https://api.ipify.org?format=json');
  const { ip } = await res.json();
  cached = ip as string;
  return cached;
}
