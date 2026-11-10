export const CLOCK_PORT = Symbol('CLOCK_PORT');
export interface ClockPort { now(): Date; }
export class SystemClock implements ClockPort { public now(): Date { return new Date(); } }
