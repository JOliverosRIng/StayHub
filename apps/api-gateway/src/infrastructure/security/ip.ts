export type IpFamily = 4 | 6;

export interface ParsedIp {
  readonly family: IpFamily;
  readonly bytes: readonly number[];
}

export interface ParsedCidr {
  readonly family: IpFamily;
  readonly prefixLength: number;
  readonly network: readonly number[];
}

const IPV4_OCTETS = 4;
const IPV6_GROUPS = 8;

function parseIpv4(value: string): readonly number[] | null {
  const parts = value.split('.');
  if (parts.length !== IPV4_OCTETS) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (part.length === 0 || part.length > 3 || !/^[0-9]+$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet < 0 || octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets;
}

function parseIpv6(value: string): readonly number[] | null {
  if (!value.includes(':')) {
    return null;
  }
  const doubleColon = value.indexOf('::');
  if (doubleColon !== value.lastIndexOf('::')) {
    return null;
  }

  const expand = (segment: string): number[] | null => {
    if (segment === '') {
      return [];
    }
    const groups: number[] = [];
    for (const piece of segment.split(':')) {
      if (piece.includes('.')) {
        const embedded = parseIpv4(piece);
        if (embedded === null) {
          return null;
        }
        groups.push(((embedded[0] ?? 0) << 8) | (embedded[1] ?? 0));
        groups.push(((embedded[2] ?? 0) << 8) | (embedded[3] ?? 0));
        continue;
      }
      if (piece.length === 0 || piece.length > 4 || !/^[0-9a-fA-F]+$/.test(piece)) {
        return null;
      }
      groups.push(Number.parseInt(piece, 16));
    }
    return groups;
  };

  if (doubleColon === -1) {
    const groups = expand(value);
    if (groups === null || groups.length !== IPV6_GROUPS) {
      return null;
    }
    return groups;
  }

  const head = expand(value.slice(0, doubleColon));
  const tail = expand(value.slice(doubleColon + 2));
  if (head === null || tail === null) {
    return null;
  }
  const missing = IPV6_GROUPS - head.length - tail.length;
  if (missing < 1) {
    return null;
  }
  return [...head, ...Array.from({ length: missing }, () => 0), ...tail];
}

function formatIpv6(groups: readonly number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;
  for (let index = 0; index < groups.length; index += 1) {
    if (groups[index] === 0) {
      if (currentStart === -1) {
        currentStart = index;
        currentLength = 0;
      }
      currentLength += 1;
      if (currentLength > bestLength) {
        bestStart = currentStart;
        bestLength = currentLength;
      }
    } else {
      currentStart = -1;
      currentLength = 0;
    }
  }
  const head = groups
    .slice(0, bestStart < 0 ? groups.length : bestStart)
    .map((group) => group.toString(16));
  const tail = groups
    .slice(bestStart < 0 ? groups.length : bestStart + bestLength)
    .map((group) => group.toString(16));
  if (bestLength < 2) {
    return [...head, ...tail].join(':');
  }
  return `${head.join(':')}::${tail.join(':')}`;
}

export function parseIp(value: string): string | null {
  const trimmed = value.trim();
  if (parseIpv4(trimmed) !== null) {
    return trimmed;
  }
  const groups = parseIpv6(trimmed);
  if (groups === null) {
    return null;
  }
  return formatIpv6(groups);
}

export function normalizeIp(value: string): string | null {
  const trimmed = value.trim();
  const mapped = /^::ffff:([0-9.]+)$/i.exec(trimmed);
  if (mapped?.[1] !== undefined && parseIpv4(mapped[1]) !== null) {
    return mapped[1];
  }
  const groups = parseIpv6(trimmed);
  if (groups === null) {
    return parseIpv4(trimmed) === null ? null : trimmed;
  }
  return formatIpv6(groups);
}

function toBytes(value: string): ParsedIp | null {
  const trimmed = value.trim();
  const octets = parseIpv4(trimmed);
  if (octets !== null) {
    return { family: 4, bytes: octets };
  }
  const groups = parseIpv6(trimmed);
  if (groups === null) {
    return null;
  }
  const bytes: number[] = [];
  for (const group of groups) {
    bytes.push((group >> 8) & 0xff, group & 0xff);
  }
  return { family: 6, bytes };
}

function toCidr(value: string): ParsedCidr | null {
  const separator = value.lastIndexOf('/');
  if (separator === -1) {
    return null;
  }
  const address = toBytes(value.slice(0, separator));
  const rawPrefix = value.slice(separator + 1);
  if (address === null || !/^[0-9]+$/.test(rawPrefix)) {
    return null;
  }
  const prefixLength = Number(rawPrefix);
  const maximum = address.bytes.length * 8;
  if (prefixLength < 0 || prefixLength > maximum) {
    return null;
  }
  const bytes: number[] = [];
  for (let index = 0; index < address.bytes.length; index += 1) {
    const remainingBits = prefixLength - index * 8;
    const mask = remainingBits >= 8 ? 0xff : remainingBits <= 0 ? 0x00 : (0xff << (8 - remainingBits)) & 0xff;
    bytes.push((address.bytes[index] ?? 0) & mask);
  }
  return { family: address.family, prefixLength, network: bytes };
}

export function isIpInCidr(value: string, cidr: string): boolean {
  const address = toBytes(value);
  const network = toCidr(cidr);
  if (address === null || network === null || address.family !== network.family) {
    return false;
  }
  const totalBits = address.bytes.length * 8;
  if (network.prefixLength === 0) {
    return true;
  }
  if (network.prefixLength === totalBits) {
    return address.bytes.every((byte, index) => byte === network.network[index]);
  }
  const fullBytes = Math.floor(network.prefixLength / 8);
  for (let index = 0; index < fullBytes; index += 1) {
    if (address.bytes[index] !== network.network[index]) {
      return false;
    }
  }
  const remainder = network.prefixLength % 8;
  if (remainder === 0) {
    return true;
  }
  const mask = (0xff << (8 - remainder)) & 0xff;
  return ((address.bytes[fullBytes] ?? 0) & mask) === ((network.network[fullBytes] ?? 0) & mask);
}
