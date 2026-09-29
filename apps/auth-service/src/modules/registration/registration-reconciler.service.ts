import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import {
  RECONCILE_REGISTRATIONS,
  type ReconcileRegistrations,
} from '@auth/application/registration/reconcile-registrations.use-case';
import { AUTH_CONFIG, type AuthConfig } from '@auth/infrastructure/config/auth-config';
import { AuthLogger } from '@auth/infrastructure/observability/auth-logger';

@Injectable()
export class RegistrationReconcilerService implements OnModuleInit, OnModuleDestroy {
  private handle: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  public constructor(
    @Inject(RECONCILE_REGISTRATIONS) private readonly reconcile: ReconcileRegistrations,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
    private readonly logger: AuthLogger,
  ) {}

  public onModuleInit(): void {
    this.schedule();
  }

  public async tick(): Promise<void> {
    await this.reconcile.execute();
  }

  public onModuleDestroy(): void {
    this.stopped = true;
    if (this.handle !== null) {
      clearTimeout(this.handle);
      this.handle = null;
    }
  }

  private schedule(): void {
    this.handle = setTimeout(() => {
      void this.run();
    }, this.config.reconciler.intervalSeconds * 1000);
  }

  private async run(): Promise<void> {
    this.handle = null;
    try {
      await this.reconcile.execute();
      this.logger.log('registration_reconciler_tick', { event: 'registration_reconciler_tick' });
    } catch {
      this.logger.error('registration_reconciler_failed', { code: 'RECONCILER_TICK_FAILED' });
    }
    if (!this.stopped) this.schedule();
  }
}
