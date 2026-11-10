import { BookingConfirmedUseCase, InvalidBookingEventError } from '../../src/application/notifications/booking-confirmed.use-case';

const command = {
  userId: '6b2bf6ea-4d76-4f3e-84a7-5a7857825b66',
  bookingId: '22222222-2222-4222-8222-222222222222',
  propertyName: 'Hotel Central',
  roomName: 'Suite',
  checkIn: '2030-01-01',
  checkOut: '2030-01-02',
  guests: 2,
  totalPrice: '20.00',
  checkInAt: '2030-01-01T00:00:00.000Z',
};

function setup(now = new Date('2029-12-01T12:00:00.000Z')): { send: { execute: jest.Mock }; reminders: { scheduleBookingReminder: jest.Mock }; useCase: BookingConfirmedUseCase } {
  const send = { execute: jest.fn().mockResolvedValue({ notification: { id: 'n1', status: 'SENT' }, replayed: false }) };
  const reminders = { scheduleBookingReminder: jest.fn().mockResolvedValue(undefined) };
  const useCase = new BookingConfirmedUseCase(send as never, reminders as never, () => now);
  return { send, reminders, useCase };
}

describe('BookingConfirmedUseCase', () => {
  it('creates the confirmation and schedules the reminder with canonical booking fields', async () => {
    const { send, reminders, useCase } = setup();
    const result = await useCase.execute(command);
    expect(send.execute).toHaveBeenCalledWith(expect.objectContaining({
      userId: command.userId,
      type: 'BOOKING_CONFIRMATION',
      channel: 'IN_APP',
      templateData: {
        bookingId: command.bookingId,
        propertyName: command.propertyName,
        roomName: command.roomName,
        checkIn: command.checkIn,
        checkOut: command.checkOut,
        guests: command.guests,
        totalPrice: command.totalPrice,
      },
      idempotencyKey: `booking-confirmation:${command.bookingId}`,
    }));
    expect(reminders.scheduleBookingReminder).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: command.bookingId,
      userId: command.userId,
      propertyName: command.propertyName,
      roomName: command.roomName,
      checkIn: command.checkIn,
      scheduledAt: new Date('2029-12-31T00:00:00.000Z'),
    }));
    expect(result.reminderScheduledAt).toBe('2029-12-31T00:00:00.000Z');
  });

  it('schedules immediately when the confirmation arrives inside the reminder window', async () => {
    const now = new Date('2030-01-01T00:00:00.000Z');
    const { reminders, useCase } = setup(now);
    const result = await useCase.execute(command);
    expect(result.reminderScheduledAt).toBe(now.toISOString());
    expect(reminders.scheduleBookingReminder).toHaveBeenCalledWith(expect.objectContaining({ scheduledAt: now }));
  });

  it.each([
    { ...command, checkInAt: '2030-01-02T00:00:00.000Z' },
    { ...command, checkInAt: 'not-a-date' },
  ])('rejects a check-in date that does not match the instant', async (invalid) => {
    const { send, reminders, useCase } = setup();
    await expect(useCase.execute(invalid)).rejects.toBeInstanceOf(InvalidBookingEventError);
    expect(send.execute).not.toHaveBeenCalled();
    expect(reminders.scheduleBookingReminder).not.toHaveBeenCalled();
  });
});
