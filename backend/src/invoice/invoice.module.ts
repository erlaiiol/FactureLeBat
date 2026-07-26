import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompanyModule } from '../company/company.module';
import { CustomerModule } from '../customer/customer.module';
import { MailSettingsModule } from '../mail-settings/mail-settings.module';
import { MailerModule } from '../mailer/mailer.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { InvoiceMailService } from './mail/invoice-mail.service';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [
    CompanyModule,
    CustomerModule,
    ServiceCatalogModule,
    PdfModule,
    MailSettingsModule,
    MailerModule,
    BillingModule,
  ],
  controllers: [InvoiceController],
  providers: [
    InvoiceService,
    InvoiceRepository,
    InvoiceCalculationService,
    InvoiceMapper,
    InvoiceMailService,
  ],
  // Phase 17: ReportsModule reuses the exact same repository queries +
  // totals-computation pipeline the invoice API itself uses (see
  // docs/conventions.md's "no business-logic duplication") rather than
  // re-deriving per-line totals/redistribution math from scratch.
  exports: [InvoiceRepository, InvoiceMapper],
})
export class InvoiceModule {}
