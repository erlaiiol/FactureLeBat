import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const SMTP_SELECT = {
  smtpHost: true,
  smtpPort: true,
  smtpSecure: true,
  smtpUser: true,
  smtpPasswordEncrypted: true,
} as const;

export interface SmtpRow {
  smtpHost: string | null;
  smtpPort: number | null;
  smtpSecure: boolean;
  smtpUser: string | null;
  smtpPasswordEncrypted: string | null;
}

export interface SaveSmtpSettingsData {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  passwordEncrypted: string;
}

@Injectable()
export class MailSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Phase 13: a Company row always exists by the time an authenticated
  // request reaches here — plain findUniqueOrThrow/update, no more
  // upsert-on-first-write (see CompanyRepository).
  getRaw(companyId: string): Promise<SmtpRow> {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: SMTP_SELECT,
    });
  }

  save(companyId: string, data: SaveSmtpSettingsData): Promise<SmtpRow> {
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        smtpHost: data.host,
        smtpPort: data.port,
        smtpSecure: data.secure,
        smtpUser: data.user,
        smtpPasswordEncrypted: data.passwordEncrypted,
      },
      select: SMTP_SELECT,
    });
  }
}
