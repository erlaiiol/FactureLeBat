import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { SmtpCredentials } from '../mail-settings/entities/mail-settings.entity';

export interface SendMailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendMailParams {
  smtp: SmtpCredentials;
  from: { name: string; address: string };
  to: string;
  subject: string;
  text: string;
  attachments?: SendMailAttachment[];
}

// Isolated from InvoiceMailService on purpose, same "isolate the risky
// boundary" split as GroqClientService/SafeFetcherService: this class only
// ever knows about the SMTP transport call itself (connect, auth, send) —
// never invoice content, templates, or persistence. A transporter is built
// fresh per send rather than cached/pooled: SMTP credentials can change
// between two sends (and today there is only ever one company's worth of
// traffic), so there is no real connection-reuse benefit to chase yet.
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  async send(params: SendMailParams): Promise<void> {
    const transporter = createTransport({
      host: params.smtp.host,
      port: params.smtp.port,
      secure: params.smtp.secure,
      auth: { user: params.smtp.user, pass: params.smtp.password },
    });

    try {
      await transporter.sendMail({
        from: `"${params.from.name}" <${params.from.address}>`,
        to: params.to,
        subject: params.subject,
        text: params.text,
        attachments: params.attachments,
      });
    } catch (error) {
      this.logger.warn(`SMTP send failed: ${String(error)}`);
      throw new BadGatewayException(
        `Échec de l'envoi de l'email : ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
