import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_COMPANY_PROFILE, SINGLETON_COMPANY_ID } from '../company/company.constants';

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

  // Same "PATCH/GET can legitimately be the first-ever write" reasoning as
  // CompanyRepository/OnboardingRepository — upsert, not findUnique.
  getRaw(): Promise<SmtpRow> {
    return this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: {},
      create: { id: SINGLETON_COMPANY_ID, ...DEFAULT_COMPANY_PROFILE },
      select: SMTP_SELECT,
    });
  }

  save(data: SaveSmtpSettingsData): Promise<SmtpRow> {
    const smtpFields = {
      smtpHost: data.host,
      smtpPort: data.port,
      smtpSecure: data.secure,
      smtpUser: data.user,
      smtpPasswordEncrypted: data.passwordEncrypted,
    };
    return this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: smtpFields,
      create: { id: SINGLETON_COMPANY_ID, ...DEFAULT_COMPANY_PROFILE, ...smtpFields },
      select: SMTP_SELECT,
    });
  }
}
