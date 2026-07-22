import { isIPv4, isIPv6 } from 'node:net';

// Every range here is a destination the backend must never connect to on an
// artisan's behalf: loopback/private/link-local addresses (including the
// 169.254.169.254 cloud-metadata address) all reach services the artisan
// has no business touching from a "paste a product URL" text field. This is
// the one function in the SSRF defense where a missed range is a real
// vulnerability, so it's kept pure and unit-tested directly (see
// ip-guard.spec.ts) rather than folded into the fetch logic.
export function isBlockedIp(ip: string): boolean {
  const address = ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;

  if (isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 10) return true; // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata lives here)
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    return false;
  }

  if (isIPv6(address)) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true; // loopback / unspecified
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 unique local
    if (['fe8', 'fe9', 'fea', 'feb'].some((prefix) => lower.startsWith(prefix))) return true; // fe80::/10 link-local
    return false;
  }

  return true; // unrecognized format — block conservatively rather than guess
}
