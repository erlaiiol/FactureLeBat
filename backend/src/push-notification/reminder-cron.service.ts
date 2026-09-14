import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PushNotificationRepository } from './push-notification.repository';
import { PushSenderService } from './push-sender.service';
import { PushUnavailableError } from './push-unavailable.error';

// Builds the French digest copy for one artisan — e.g. "3 factures en
// retard, 2 non payées" — a single bundled push per artisan, not one push
// per invoice, since this is a daily summary, not a real-time alert.
// Phase 1.3-5 (2026 e-invoicing reform, workflow automation): a third,
// independent clause — an invoice can be simultaneously late/unpaid AND
// un-transmitted, so this never suppresses in favor of the other two.
export function buildDigestBody(
  lateCount: number,
  unpaidCount: number,
  unsentEInvoiceCount: number,
): string {
  const parts: string[] = [];
  if (lateCount > 0) {
    parts.push(`${lateCount} facture${lateCount > 1 ? 's' : ''} en retard`);
  }
  if (unpaidCount > 0) {
    parts.push(
      `${unpaidCount} facture${unpaidCount > 1 ? 's' : ''} non payée${unpaidCount > 1 ? 's' : ''}`,
    );
  }
  if (unsentEInvoiceCount > 0) {
    parts.push(
      `${unsentEInvoiceCount} facture${unsentEInvoiceCount > 1 ? 's' : ''} non transmise${unsentEInvoiceCount > 1 ? 's' : ''}`,
    );
  }
  return parts.join(', ');
}

// Static copy for the invoice-creation nudge — unlike buildDigestBody, there
// are no per-company counts to interpolate here (the trigger is an absence
// of activity, not a number worth reporting), so this is just a constant
// rather than a builder function.
export const INVOICE_NUDGE_BODY =
  'Ça fait une semaine sans facture ni devis. FactureLe reste là dès que vous en avez besoin !';

// First scheduled job in this codebase — runs in-process in the existing
// single backend container (today's deploy is one replica; a distributed
// lock or dedicated scheduler would only be needed if that ever changes,
// not a concern today).
@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name);

  constructor(
    private readonly repository: PushNotificationRepository,
    private readonly sender: PushSenderService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_9AM, { timeZone: 'Europe/Paris' })
  async sendDailyReminders(): Promise<void> {
    if (!this.sender.isConfigured()) {
      this.logger.warn(
        'Skipping daily reminder push: FIREBASE_SERVICE_ACCOUNT_JSON not configured',
      );
      return;
    }

    const now = new Date();
    const counts = await this.repository.findReminderCounts(now);
    if (counts.length === 0) {
      return;
    }

    const tokensByCompany = await this.repository.findDeviceTokensByCompanyIds(
      counts.map((c) => c.companyId),
    );

    const remindedCompanyIds: string[] = [];
    for (const { companyId, lateCount, unpaidCount, unsentEInvoiceCount } of counts) {
      const tokens = tokensByCompany.get(companyId);
      if (!tokens || tokens.length === 0) {
        continue;
      }
      try {
        await this.sender.send(tokens, {
          title: 'FactureLe',
          body: buildDigestBody(lateCount, unpaidCount, unsentEInvoiceCount),
        });
        remindedCompanyIds.push(companyId);
      } catch (error) {
        if (error instanceof PushUnavailableError) {
          this.logger.warn(`Push send failed for company ${companyId}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    await this.repository.markReminded(remindedCompanyIds, now);
  }

  // Separate cron (own timeslot, 15 minutes after the digest above) rather
  // than folded into sendDailyReminders: this fires on an entirely different
  // condition (inactivity, not outstanding invoices) and a company can match
  // both independently — e.g. an artisan who still has an old late invoice
  // sitting unpaid but hasn't made a new one in over a week gets both pushes,
  // not one conflated message.
  @Cron('15 9 * * *', { timeZone: 'Europe/Paris' })
  async sendInvoiceCreationNudges(): Promise<void> {
    if (!this.sender.isConfigured()) {
      return;
    }

    const now = new Date();
    const companyIds = await this.repository.findInactiveCompanyIds(now);
    if (companyIds.length === 0) {
      return;
    }

    const tokensByCompany = await this.repository.findDeviceTokensByCompanyIds(companyIds);

    const nudgedCompanyIds: string[] = [];
    for (const companyId of companyIds) {
      const tokens = tokensByCompany.get(companyId);
      if (!tokens || tokens.length === 0) {
        continue;
      }
      try {
        await this.sender.send(tokens, { title: 'FactureLe', body: INVOICE_NUDGE_BODY });
        nudgedCompanyIds.push(companyId);
      } catch (error) {
        if (error instanceof PushUnavailableError) {
          this.logger.warn(`Invoice nudge push failed for company ${companyId}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    await this.repository.markInvoiceNudged(nudgedCompanyIds, now);
  }
}
