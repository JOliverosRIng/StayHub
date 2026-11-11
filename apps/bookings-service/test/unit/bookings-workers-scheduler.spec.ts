import { BookingsWorkersScheduler } from '@bookings/infrastructure/scheduling/bookings-workers.scheduler';
import type { BookingsConfig } from '@bookings/infrastructure/config/bookings-config';

const config = { workerPollIntervalMs: 50, workerBatchSize: 2, outboxBatchSize: 3 } as unknown as BookingsConfig;

function setup() {
  const outbox = { publishBatch: jest.fn().mockResolvedValue(0) };
  const orders = { runOnce: jest.fn().mockResolvedValue(0) };
  const refunds = { runOnce: jest.fn().mockResolvedValue(0) };
  const expiry = { runOnce: jest.fn().mockResolvedValue(0) };
  return { outbox, orders, refunds, expiry, scheduler: new BookingsWorkersScheduler(outbox as never, orders as never, refunds as never, expiry as never, config) };
}

describe('BookingsWorkersScheduler', () => {
  it('runs outbox and payment workers with bounded batches', async () => {
    const { outbox, orders, refunds, expiry, scheduler } = setup();
    await scheduler.runOnce();
    expect(outbox.publishBatch).toHaveBeenCalledWith(3);
    expect(expiry.runOnce).toHaveBeenCalledWith(2);
    expect(orders.runOnce).toHaveBeenCalledWith(2);
    expect(refunds.runOnce).toHaveBeenCalledWith(2);
  });

  it('isolates a failing task from the remaining workers', async () => {
    const { outbox, orders, refunds, expiry, scheduler } = setup();
    outbox.publishBatch.mockRejectedValue(new Error('broker down'));
    await expect(scheduler.runOnce()).resolves.toBeUndefined();
    expect(expiry.runOnce).toHaveBeenCalled();
    expect(orders.runOnce).toHaveBeenCalled();
    expect(refunds.runOnce).toHaveBeenCalled();
  });

  it('starts and stops without leaving a timer behind', () => {
    jest.useFakeTimers();
    try {
      const { scheduler } = setup();
      const runOnce = jest.spyOn(scheduler, 'runOnce').mockResolvedValue();
      scheduler.onApplicationBootstrap();
      scheduler.onApplicationShutdown();
      jest.advanceTimersByTime(200);
      expect(runOnce).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
