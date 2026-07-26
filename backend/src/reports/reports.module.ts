import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { PdfModule } from '../invoice/pdf/pdf.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [InvoiceModule, CompanyModule, PdfModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
