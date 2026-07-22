import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { MailSettings, SmtpCredentials } from './entities/mail-settings.entity';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';
import { MailSettingsRepository, SmtpRow } from './mail-settings.repository';
import { decryptSmtpPassword, encryptSmtpPassword } from './smtp-password-crypto.util';

function toMailSettings(row: SmtpRow): MailSettings {
  return {
    host: row.smtpHost,
    port: row.smtpPort,
    secure: row.smtpSecure,
    user: row.smtpUser,
    configured: row.smtpPasswordEncrypted !== null,
  };
}

@Injectable()
export class MailSettingsService {
  private readonly encryptionKey?: string;

  constructor(
    private readonly repository: MailSettingsRepository,
    config: ConfigService,
  ) {
    this.encryptionKey = config.get<string>('APP_ENCRYPTION_KEY');
  }

  async getSettings(): Promise<MailSettings> {
    return toMailSettings(await this.repository.getRaw());
  }

  // Verifies the SMTP connection actually works before ever persisting it —
  // an artisan should never end up with a saved-but-broken mail
  // configuration that silently fails the first time they try to send an
  // invoice (see docs/development-rules.md's "delivery failures surfaced
  // clearly" spirit, applied one step earlier here).
  async updateSettings(dto: UpdateMailSettingsDto): Promise<MailSettings> {
    if (!this.encryptionKey) {
      throw new ServiceUnavailableException(
        "L'envoi d'email n'est pas configuré sur ce déploiement (APP_ENCRYPTION_KEY manquant).",
      );
    }

    const transporter = createTransport({
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      auth: { user: dto.user, pass: dto.password },
    });
    try {
      await transporter.verify();
    } catch (error) {
      throw new BadRequestException(
        `Connexion au serveur SMTP impossible : ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const passwordEncrypted = encryptSmtpPassword(dto.password, this.encryptionKey);
    const row = await this.repository.save({
      host: dto.host,
      port: dto.port,
      secure: dto.secure,
      user: dto.user,
      passwordEncrypted,
    });
    return toMailSettings(row);
  }

  // Internal use only (InvoiceMailService) — never exposed on a controller.
  // Returns null when mailing isn't usable yet, for either reason: no
  // credentials saved, or no encryption key configured on this deployment.
  async getDecryptedCredentials(): Promise<SmtpCredentials | null> {
    if (!this.encryptionKey) {
      return null;
    }
    const row = await this.repository.getRaw();
    if (!row.smtpHost || !row.smtpPort || !row.smtpUser || !row.smtpPasswordEncrypted) {
      return null;
    }
    return {
      host: row.smtpHost,
      port: row.smtpPort,
      secure: row.smtpSecure,
      user: row.smtpUser,
      password: decryptSmtpPassword(row.smtpPasswordEncrypted, this.encryptionKey),
    };
  }
}
