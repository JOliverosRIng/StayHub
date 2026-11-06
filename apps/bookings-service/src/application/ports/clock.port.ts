export interface ClockPort { now(): Date; today(): string; }
export const CLOCK_PORT = Symbol('CLOCK_PORT');
export class SystemClock implements ClockPort { public now(): Date { return new Date(); } public today(): string { return this.now().toISOString().slice(0,10); } }
