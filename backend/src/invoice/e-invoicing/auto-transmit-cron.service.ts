import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InvoiceRepository } from '../invoice.repository';
import { EInvoiceTransmissionService } from './e-invoice-transmission.service';

// Phase 1.3-3 (2026 e-invoicing reform, workflow automation): the sweep
// side of "delayed automatic PA transmission" — same `@nestjs/schedule`
// pattern push-notification/reminder-cron.service.ts already established as
// this codebase's first scheduled job, running in-process on this app's
// single backend instance (no distributed lock needed, same reasoning as
// that file and CompanySuperPdpService's own refresh dedup).
//
// Every 5 minutes rather than something tighter to the 20-minute grace
// period: frequent enough that the real-world delay past the grace period
// stays small (at most ~5 minutes), without polling the database far more
// often than that small a margin actually needs.
@Injectable()
export class AutoTransmitCronService {
  private readonly logger = new Logger(AutoTransmitCronService.name);

  constructor(
    private readonly invoiceRepository: InvoiceRepository,
    private readonly transmissionService: EInvoiceTransmissionService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    const due = await this.invoiceRepository.findDueForAutoTransmit(new Date());

    for (const { id, companyId } of due) {
      // Atomic claim first — a slow-running previous sweep still processing
      // this same row (or an artisan's manual "Envoyer via PA" click racing
      // it) makes this a no-op false, never a double transmission. See
      // InvoiceRepository.claimAutoTransmit's own comment.
      const claimed = await this.invoiceRepository.claimAutoTransmit(companyId, id);
      if (!claimed) {
        continue;
      }
      try {
        await this.transmissionService.transmit(companyId, id);
      } catch (error) {
        // Logged, not thrown — one company's SUPER PDP hiccup or a genuine
        // Factur-X validation failure must never stop the rest of this run.
        // Lands back in eInvoiceTransmissionStatus NOT_SENT (transmit()
        // never partially applies), picked up by 1.3-5's reminder digest
        // once that phase ships, same as a failed manual click would be.
        this.logger.warn(
          `Auto-transmit failed for invoice ${id} (company ${companyId}): ${String(error)}`,
        );
      }
    }
  }
}
