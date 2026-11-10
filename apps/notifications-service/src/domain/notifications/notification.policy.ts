import { createHash } from 'node:crypto';
import type { NotificationChannel, NotificationType, RenderedNotification, TemplateData } from './notification.types';

export class NotificationPolicyError extends Error {
  readonly code = 'INVALID_NOTIFICATION';
}

const layouts: Record<NotificationType, string[]> = {
  BOOKING_CONFIRMATION: ['bookingId', 'roomTitle', 'roomLocation', 'checkIn', 'checkOut', 'guests', 'totalPrice'],
  CHECKIN_REMINDER: ['bookingId', 'roomTitle', 'roomLocation', 'checkIn'],
  SYSTEM_ALERT: ['alertCode', 'title', 'message'],
};

function cleanText(value: string, max: number): string {
  const cleaned = [...value.normalize('NFC').replace(/<[^>]*>/g, '')].map((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  }).join('').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > max) throw new NotificationPolicyError('Invalid text value');
  return cleaned;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function renderNotification(type: NotificationType, input: unknown): RenderedNotification {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NotificationPolicyError('Template data must be an object');
  const source = input as Record<string, unknown>;
  const required = layouts[type];
  if (!required || Object.keys(source).length !== required.length || required.some((key) => !(key in source))) throw new NotificationPolicyError('Unexpected template fields');
  const data: TemplateData = {};
  for (const key of required) {
    const value = source[key];
    if (typeof value !== 'string' && typeof value !== 'number') throw new NotificationPolicyError('Invalid template value');
    data[key] = value;
  }
  const title = cleanText(String(data.roomTitle ?? data.title ?? ''), 120);
  const location = data.roomLocation === undefined ? undefined : cleanText(String(data.roomLocation), 200);
  const dateFields = type === 'BOOKING_CONFIRMATION' ? ['checkIn', 'checkOut'] : type === 'CHECKIN_REMINDER' ? ['checkIn'] : [];
  for (const field of dateFields) {
    const date = data[field];
    if (typeof date !== 'string' || !validDate(date)) throw new NotificationPolicyError('Invalid date');
  }
  if (type === 'BOOKING_CONFIRMATION' && (Date.parse(`${data.checkOut}T00:00:00Z`) <= Date.parse(`${data.checkIn}T00:00:00Z`))) throw new NotificationPolicyError('checkOut must follow checkIn');
  if (type === 'BOOKING_CONFIRMATION') {
    const id = cleanText(String(data.bookingId), 100);
    if (!Number.isInteger(data.guests) || (data.guests as number) < 1 || (data.guests as number) > 100 || !/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$/.test(String(data.totalPrice))) throw new NotificationPolicyError('Invalid booking values');
    data.bookingId = id; data.roomTitle = title; data.roomLocation = location!;
    return { subject: `Reserva confirmada: ${title}`, body: `Reserva ${id} en ${title}, ${location}. Check-in ${data.checkIn}; check-out ${data.checkOut}. Huéspedes: ${data.guests}. Total: ${data.totalPrice}.`, data };
  }
  if (type === 'CHECKIN_REMINDER') {
    const id = cleanText(String(data.bookingId), 100);
    data.bookingId = id; data.roomTitle = title; data.roomLocation = location!;
    return { subject: `Recordatorio de check-in: ${title}`, body: `Tu check-in para ${title}, ${location}, es el ${data.checkIn}. Reserva ${id}.`, data };
  }
  const alertCode = String(data.alertCode);
  if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(alertCode)) throw new NotificationPolicyError('Invalid alert code');
  data.title = title; data.message = cleanText(String(data.message), 2000);
  return { subject: `[${alertCode}] ${title}`, body: String(data.message), data };
}

export function fingerprintRequest(input: { userId: string; type: NotificationType; channel: NotificationChannel; recipientEmail?: string; data: TemplateData }): string {
  const canonical = JSON.stringify({ userId: input.userId.toLowerCase(), type: input.type, channel: input.channel, recipientEmail: input.recipientEmail?.trim().toLowerCase() ?? null, data: Object.fromEntries(Object.entries(input.data).sort(([a], [b]) => a.localeCompare(b))) });
  return createHash('sha256').update(canonical).digest('hex');
}

export function assertStatusTransition(from: string, to: string): void {
  if (from !== 'PENDING' || !['SENT', 'FAILED'].includes(to)) throw new NotificationPolicyError('Invalid status transition');
}
