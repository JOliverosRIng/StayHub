import { assertStatusTransition, fingerprintRequest, renderNotification } from '../../src/domain/notifications/notification.policy';

describe('notification domain policy (NTF-004)', () => {
  it.each([
    ['BOOKING_CONFIRMATION', { bookingId: 'b1', roomTitle: 'Suite', roomLocation: 'Bogotá', checkIn: '2026-12-01', checkOut: '2026-12-03', guests: 2, totalPrice: '12.50' }],
    ['CHECKIN_REMINDER', { bookingId: 'b1', roomTitle: 'Suite', roomLocation: 'Bogotá', checkIn: '2026-12-01' }],
    ['SYSTEM_ALERT', { alertCode: 'SYSTEM_DOWN', title: '<b>Maintenance</b>', message: 'Update soon' }],
  ])('renders %s as plain text', (type, data) => {
    const rendered = renderNotification(type as never, data);
    expect(rendered.subject.length).toBeGreaterThan(0);
    expect(rendered.body).not.toMatch(/[<>]/);
  });

  it('rejects extra template fields and invalid transitions', () => {
    expect(() => renderNotification('SYSTEM_ALERT', { alertCode: 'A1', title: 'x', message: 'y', email: 'x' })).toThrow();
    expect(() => assertStatusTransition('SENT', 'FAILED')).toThrow();
  });

  it('fingerprints canonical field order and normalizes email', () => {
    const one = fingerprintRequest({ userId: 'ABC', type: 'SYSTEM_ALERT', channel: 'EMAIL', recipientEmail: 'A@B.TEST', data: { title: 'x', message: 'y' } });
    const two = fingerprintRequest({ userId: 'abc', type: 'SYSTEM_ALERT', channel: 'EMAIL', recipientEmail: 'a@b.test', data: { message: 'y', title: 'x' } });
    expect(one).toBe(two);
  });
});
