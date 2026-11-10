export class GatewayCircuitOpenError extends Error {
  constructor() {
    super('Payment gateway circuit is open');
    this.name = 'GatewayCircuitOpenError';
  }
}

export class GatewayTimeoutError extends Error {
  constructor() {
    super('Payment gateway operation timed out');
    this.name = 'GatewayTimeoutError';
  }
}

export interface GatewayCircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly resetMs: number;
  readonly timeoutMs: number;
  readonly now?: () => number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

export class GatewayCircuitBreaker {
  private readonly now: () => number;
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private halfOpenProbeInFlight = false;

  constructor(private readonly options: GatewayCircuitBreakerOptions) {
    this.now = options.now ?? Date.now;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    this.enterOrReject();
    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new GatewayTimeoutError()), this.options.timeoutMs);
      });
      const result = await Promise.race([Promise.resolve().then(action), timeout]);
      this.state = 'closed';
      this.consecutiveFailures = 0;
      return result;
    } catch (error) {
      this.consecutiveFailures += 1;
      if (this.state === 'half-open' || this.consecutiveFailures >= this.options.failureThreshold) {
        this.state = 'open';
        this.openedAt = this.now();
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
      this.halfOpenProbeInFlight = false;
    }
  }

  private enterOrReject(): void {
    if (this.state === 'open') {
      if (this.now() - this.openedAt < this.options.resetMs) throw new GatewayCircuitOpenError();
      this.state = 'half-open';
    }
    if (this.state === 'half-open') {
      if (this.halfOpenProbeInFlight) throw new GatewayCircuitOpenError();
      this.halfOpenProbeInFlight = true;
    }
  }
}
