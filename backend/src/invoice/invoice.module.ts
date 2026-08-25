import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompanyModule } from '../company/company.module';
import { CustomerModule } from '../customer/customer.module';
import { DiscountModule } from '../discount/discount.module';
import { MailSettingsModule } from '../mail-settings/mail-settings.module';
import { MailerModule } from '../mailer/mailer.module';
import { ProductModule } from '../product/product.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { AutoTransmitCronService } from './e-invoicing/auto-transmit-cron.service';
import { CompanySuperPdpController } from './e-invoicing/company-super-pdp.controller';
import { CompanySuperPdpService } from './e-invoicing/company-super-pdp.service';
import { EInvoiceTransmissionService } from './e-invoicing/e-invoice-transmission.service';
import { SuperPdpClientService } from './e-invoicing/super-pdp-client.service';
import { SuperPdpProvider } from './e-invoicing/super-pdp-provider.service';
import { FacturXService } from './facturx/facturx.service';
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
    DiscountModule,
    ProductModule,
    ServiceCatalogModule,
    PdfModule,
    MailSettingsModule,
    MailerModule,
    BillingModule,
  ],
  controllers: [InvoiceController, CompanySuperPdpController],
  providers: [
    InvoiceService,
    InvoiceRepository,
    InvoiceCalculationService,
    InvoiceMapper,
    InvoiceMailService,
    FacturXService,
    // Phase 1.2-4 (2026 e-invoicing reform) — kept in this module rather
    // than a separate one, same "no extra module ceremony for a phase this
    // size" precedent FacturXService (Phase 1.2-3) already set.
    SuperPdpClientService,
    SuperPdpProvider,
    CompanySuperPdpService,
    EInvoiceTransmissionService,
    // Phase 1.3-3 (2026 e-invoicing reform, workflow automation): the
    // delayed-auto-transmit sweep — see its own file for why this lives
    // here rather than a dedicated module.
    AutoTransmitCronService,
  ],
  // Phase 17: ReportsModule reuses the exact same repository queries +
  // totals-computation pipeline the invoice API itself uses (see
  // docs/conventions.md's "no business-logic duplication") rather than
  // re-deriving per-line totals/redistribution math from scratch. Phase
  // 1.2-5: ReceivedInvoiceModule reuses CompanySuperPdpService/
  // SuperPdpClientService for the same OAuth-connected PA access — reception
  // and emission are two directions through the one PA connection, not two
  // separate ones.
  exports: [InvoiceRepository, InvoiceMapper, CompanySuperPdpService, SuperPdpClientService],
})
export class InvoiceModule {}
