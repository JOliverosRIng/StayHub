import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { DeliveryPort, DeliveryResult } from '../../application/ports/delivery.port';
import type { NotificationsConfig } from '../config/notifications-config';

@Injectable()
export class SmtpEmailAdapter implements DeliveryPort {
  readonly channel = 'EMAIL';
  private readonly transport: Transporter<SMTPTransport.SentMessageInfo> | undefined;
  private readonly from: string | undefined;

  constructor(config: NotificationsConfig) {
    const smtp = config.email;
    if (smtp.mode !== 'smtp' || !smtp.host || !smtp.port || !smtp.from) return;
    this.transport = createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure,
      auth: smtp.user && smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    this.from = smtp.from;
  }

  async deliver(notification: { recipientEmail: string | null; subject: string; body: string }): Promise<DeliveryResult> {
    if (!notification.recipientEmail || !this.transport || !this.from) return { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' };
    try {
      const result = await this.transport.sendMail({
        from: this.from,
        to: notification.recipientEmail,
        subject: notification.subject,
        text: notification.body,
      });
      const accepted = result.accepted.some((recipient) => {
        const address = typeof recipient === 'string' ? recipient : recipient.address;
        return address.toLowerCase() === notification.recipientEmail!.toLowerCase();
      });
      return accepted
        ? { accepted: true }
        : { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' };
    } catch {
      return { accepted: false, failureCode: 'DELIVERY_UNAVAILABLE' };
    }
  }
}
