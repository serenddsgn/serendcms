import nodemailer from 'nodemailer';
import type { AppConfig } from '../config.js';

export interface Mailer {
  send(mail: { to: string; subject: string; text: string; replyTo?: string }): Promise<void>;
}

export function createSmtpMailer(smtp: AppConfig['smtp']): Mailer {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    ...(smtp.user && { auth: { user: smtp.user, pass: smtp.password ?? '' } }),
    connectionTimeout: 5000,
    socketTimeout: 10_000,
  });
  return {
    async send(mail) {
      await transport.sendMail({ from: smtp.from, ...mail });
    },
  };
}
