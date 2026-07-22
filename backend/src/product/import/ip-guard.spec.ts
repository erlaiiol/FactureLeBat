import { isBlockedIp } from './ip-guard';

describe('isBlockedIp', () => {
  it.each([
    ['127.0.0.1', 'IPv4 loopback'],
    ['127.53.0.1', 'IPv4 loopback (whole /8)'],
    ['10.0.0.1', 'private 10.0.0.0/8'],
    ['172.16.0.1', 'private 172.16.0.0/12 (lower bound)'],
    ['172.31.255.255', 'private 172.16.0.0/12 (upper bound)'],
    ['192.168.1.1', 'private 192.168.0.0/16'],
    ['169.254.169.254', 'cloud metadata address'],
    ['169.254.0.1', 'link-local 169.254.0.0/16'],
    ['100.64.0.1', 'carrier-grade NAT 100.64.0.0/10'],
    ['0.0.0.0', '"this network" 0.0.0.0/8'],
    ['::1', 'IPv6 loopback'],
    ['::', 'IPv6 unspecified'],
    ['fc00::1', 'IPv6 unique local fc00::/7'],
    ['fd12:3456::1', 'IPv6 unique local fd00::/8'],
    ['fe80::1', 'IPv6 link-local fe80::/10'],
    ['::ffff:127.0.0.1', 'IPv4-mapped IPv6 loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped IPv6 cloud metadata'],
  ])('blocks %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each([
    ['8.8.8.8', 'public IPv4'],
    ['93.184.216.34', 'public IPv4 (example.com)'],
    ['172.15.255.255', 'just below the 172.16.0.0/12 private range'],
    ['172.32.0.0', 'just above the 172.16.0.0/12 private range'],
    ['2606:4700:4700::1111', 'public IPv6'],
  ])('allows %s (%s)', (ip) => {
    expect(isBlockedIp(ip)).toBe(false);
  });

  it('blocks an unrecognized address format conservatively', () => {
    expect(isBlockedIp('not-an-ip')).toBe(true);
  });
});
