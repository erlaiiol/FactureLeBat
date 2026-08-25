import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CompanyModule } from '../company/company.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PdfModule } from '../invoice/pdf/pdf.module';
import { ReceivedInvoiceModule } from '../received-invoice/received-invoice.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

// Phase 1.3-6 (2026 e-invoicing reform, workflow automation):
// ReceivedInvoiceModule imported purely for its exported
// ReceivedInvoiceRepository.countInRange — the compliance snapshot's own
// received-invoice figure.
@Module({
  imports: [InvoiceModule, CompanyModule, PdfModule, BillingModule, ReceivedInvoiceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
