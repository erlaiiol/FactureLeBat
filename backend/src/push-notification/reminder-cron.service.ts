import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PushNotificationRepository } from './push-notification.repository';
import { PushSenderService } from './push-sender.service';
import { PushUnavailableError } from './push-unavailable.error';

// Builds the French digest copy for one artisan — e.g. "3 factures en
// retard, 2 non payées" — a single bundled push per artisan, not one push
// per invoice, since this is a daily summary, not a real-time alert.
export function buildDigestBody(lateCount: number, unpaidCount: number): string {
  const parts: string[] = [];
  if (lateCount > 0) {
    parts.push(`${lateCount} facture${lateCount > 1 ? 's' : ''} en retard`);
  }
  if (unpaidCount > 0) {
    parts.push(
      `${unpaidCount} facture${unpaidCount > 1 ? 's' : ''} non payée${unpaidCount > 1 ? 's' : ''}`,
    );
  }
  return parts.join(', ');
}

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
    for (const { companyId, lateCount, unpaidCount } of counts) {
      const tokens = tokensByCompany.get(companyId);
      if (!tokens || tokens.length === 0) {
        continue;
      }
      try {
        await this.sender.send(tokens, {
          title: 'FactureLe',
          body: buildDigestBody(lateCount, unpaidCount),
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
}
