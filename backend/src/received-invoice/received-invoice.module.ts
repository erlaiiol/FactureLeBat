import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { ReceivedInvoiceController } from './received-invoice.controller';
import { ReceivedInvoiceRepository } from './received-invoice.repository';
import { ReceivedInvoiceService } from './received-invoice.service';
import { ReceivedInvoiceSyncCronService } from './received-invoice-sync-cron.service';

// Phase 1.2-5 (2026 e-invoicing reform): imports InvoiceModule purely for
// its exported CompanySuperPdpService/SuperPdpClientService — the same PA
// connection Phase 1.2-4 already built, reused here for the opposite
// direction (receiving rather than sending).
// Phase 1.3-4 (workflow automation): also imports CompanyModule directly
// (not just transitively through InvoiceModule, which doesn't re-export
// it) for CompanyRepository.findCompaniesForAutoSync, the new cron
// service's own sweep source.
@Module({
  imports: [InvoiceModule, CompanyModule],
  controllers: [ReceivedInvoiceController],
  providers: [ReceivedInvoiceRepository, ReceivedInvoiceService, ReceivedInvoiceSyncCronService],
  // Phase 1.3-6: ReportsModule reuses this repository's own countInRange
  // for the Activity Analytics compliance snapshot — same "export the
  // repository too" precedent CompanyModule/InvoiceModule already set.
  exports: [ReceivedInvoiceRepository],
})
export class ReceivedInvoiceModule {}
