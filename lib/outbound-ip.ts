let cached: string | null = null;

export async function getOutboundIp(): Promise<string> {
  if (process.env.NAMECHEAP_CLIENT_IP) return process.env.NAMECHEAP_CLIENT_IP;
  if (cached) return cached;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    cached = ip as string;
    return cached;
  } catch {
    return '127.0.0.1';
  }
}
