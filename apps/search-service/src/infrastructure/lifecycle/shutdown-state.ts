import { Injectable } from '@nestjs/common';
@Injectable()
export class ShutdownState {
  private stopping = false;
  public begin(): void { this.stopping = true; }
  public get isStopping(): boolean { return this.stopping; }
}
