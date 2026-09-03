import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CompanyRepository } from '../../company/company.repository';
import { CompanySuperPdpService } from './company-super-pdp.service';

// Phase 1.2-8 (2026 e-invoicing reform): the sweep side of "provision a
// company with SUPER PDP once its OAuth session is verified" — same
// `@nestjs/schedule` pattern AutoTransmitCronService/
// ReceivedInvoiceSyncCronService already established, running in-process on
// this app's single backend instance (no distributed lock needed).
//
// Every 30 minutes: SUPER PDP's own KYB review can take anywhere from
// minutes to days (see super-pdp-client.service.ts's getSessionStatus
// comment), so this is necessarily polling, not a webhook — but unlike
// 1.3-4's daily reception sync, an artisan is fully invisible to the
// e-invoicing network (no directory entry, wrong e-reporting schedule)
// until this sweep catches their session turning `verified`, so it runs
// more eagerly than that.
@Injectable()
export class SuperPdpProvisioningCronService {
  private readonly logger = new Logger(SuperPdpProvisioningCronService.name);

  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly companySuperPdp: CompanySuperPdpService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweep(): Promise<void> {
    if (!this.companySuperPdp.isConfigured()) {
      return;
    }
    const pending = await this.companyRepository.findCompaniesPendingSuperPdpProvisioning();

    for (const company of pending) {
      try {
        await this.companySuperPdp.provisionCompany(company);
      } catch (error) {
        // Logged, not thrown — one company's SUPER PDP hiccup (or a session
        // still pending verification, the expected common case) must never
        // block the rest of the run. Left unprovisioned, retried next sweep.
        this.logger.warn(
          `SUPER PDP provisioning failed for company ${company.id}: ${String(error)}`,
        );
      }
    }
  }
}
