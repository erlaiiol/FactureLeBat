import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CompanyRepository } from '../company/company.repository';
import { ReceivedInvoiceService } from './received-invoice.service';

// Phase 1.3-4 (2026 e-invoicing reform, workflow automation): the sweep
// side of "automatic reception sync" — same `@nestjs/schedule` pattern
// push-notification/reminder-cron.service.ts and 1.3-3's own
// AutoTransmitCronService already established, running in-process on this
// app's single backend instance (no distributed lock needed).
//
// Daily, at 7am Europe/Paris — ahead of the reminder digest's own 9am run
// (push-notification/reminder-cron.service.ts) so a same-day digest can
// reflect a same-morning sync, and no more frequent than that: SUPER PDP's
// public spec documents no webhook mechanism (confirmed during Phase
// 1.2-5), so this is polling either way, and daily is proportionate to how
// often a supplier invoice actually needs to be *seen*, not a real-time
// inbox.
@Injectable()
export class ReceivedInvoiceSyncCronService {
  private readonly logger = new Logger(ReceivedInvoiceSyncCronService.name);

  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly receivedInvoiceService: ReceivedInvoiceService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_7AM, { timeZone: 'Europe/Paris' })
  async sweep(): Promise<void> {
    const companies = await this.companyRepository.findCompaniesForAutoSync();

    for (const { id } of companies) {
      try {
        // Unchanged from the manual "Actualiser" button's own call — this
        // phase is purely "who triggers it and when," no new sync logic.
        await this.receivedInvoiceService.sync(id);
      } catch (error) {
        // Logged, not thrown — one company's SUPER PDP hiccup must never
        // block the rest of the run, same posture as 1.3-3's cron.
        this.logger.warn(`Auto-sync failed for company ${id}: ${String(error)}`);
      }
    }
  }
}
