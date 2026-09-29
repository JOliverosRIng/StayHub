import { isIpInCidr, normalizeIp } from './ip';

export const FALLBACK_ORIGIN = '127.0.0.1';

export class TrustedOriginService {
  private readonly trustedCidrs: readonly string[];

  constructor(trustedProxyCidrs: readonly string[]) {
    this.trustedCidrs = [...trustedProxyCidrs];
  }

  isTrustedProxy(address: string | null | undefined): boolean {
    if (address === null || address === undefined) {
      return false;
    }
    return this.trustedCidrs.some((cidr) => isIpInCidr(address, cidr));
  }

  resolve(
    socketAddress: string | null | undefined,
    forwardedFor: string | readonly string[] | undefined,
  ): string {
    const peer = socketAddress === null || socketAddress === undefined
      ? FALLBACK_ORIGIN
      : normalizeIp(socketAddress) ?? FALLBACK_ORIGIN;

    if (forwardedFor === undefined || !this.isTrustedProxy(peer)) {
      return peer;
    }

    const chain = this.forwardedChain(forwardedFor);
    if (chain === null || chain.length === 0) {
      return peer;
    }

    for (let index = chain.length - 1; index >= 0; index -= 1) {
      if (!this.isTrustedProxy(chain[index])) {
        return chain[index] as string;
      }
    }
    return chain[0] as string;
  }

  private forwardedChain(forwardedFor: string | readonly string[]): string[] | null {
    const raw = Array.isArray(forwardedFor) ? forwardedFor.join(',') : (forwardedFor as string);
    const chain: string[] = [];
    for (const segment of raw.split(',')) {
      const normalized = normalizeIp(segment);
      if (normalized === null) {
        return null;
      }
      chain.push(normalized);
    }
    return chain;
  }
}
