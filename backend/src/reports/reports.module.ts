import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PdfModule } from '../invoice/pdf/pdf.module';
import { ProductModule } from '../product/product.module';
import { ReceivedInvoiceModule } from '../received-invoice/received-invoice.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Phase 1.3-6 (2026 e-invoicing reform, workflow automation):
// ReceivedInvoiceModule imported purely for its exported
// ReceivedInvoiceRepository.countInRange — the compliance snapshot's own
// received-invoice figure. Phase 1.6: ProductModule/ServiceCatalogModule
// imported purely for their exported ProductService/ServiceCatalogService's
// findMarginConfigByIds — Margin Analytics' batch margin lookup. Neither
// imports ReportsModule (both only depend on BillingModule/
// CatalogFolderModule), so no circular dependency.
@Module({
  imports: [
    InvoiceModule,
    CompanyModule,
    PdfModule,
    BillingModule,
    ReceivedInvoiceModule,
    ProductModule,
    ServiceCatalogModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
