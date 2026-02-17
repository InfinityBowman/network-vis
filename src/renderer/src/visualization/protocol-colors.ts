export const PROTOCOL_COLORS: Record<string, string> = {
  HTTP: '#3B82F6',
  HTTPS: '#06B6D4',
  TLS: '#0EA5E9',
  'TLSv1.2': '#0EA5E9',
  'TLSv1.3': '#0EA5E9',
  DNS: '#8B5CF6',
  UDP: '#A78BFA',
  TCP: '#6366F1',
  ICMP: '#F59E0B',
  ICMPv6: '#F59E0B',
  ARP: '#10B981',
  DHCP: '#34D399',
  DHCPv6: '#34D399',
  MDNS: '#F472B6',
  QUIC: '#22D3EE',
  SSH: '#EF4444',
  SMB: '#F97316',
  SMB2: '#F97316',
  NBNS: '#FB923C',
  NTP: '#A3E635',
  SSDP: '#E879F9',
  LLMNR: '#D946EF',
  FTP: '#EC4899',
  IGMP: '#84CC16',
  STUN: '#14B8A6',
}

export const PROTOCOL_COLOR_FALLBACK = '#64748b'

export function getProtocolColor(protocol: string): string {
  return PROTOCOL_COLORS[protocol] ?? PROTOCOL_COLOR_FALLBACK
}
