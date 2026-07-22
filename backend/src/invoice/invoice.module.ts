import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { CustomerModule } from '../customer/customer.module';
import { ServiceCatalogModule } from '../service-catalog/service-catalog.module';
import { InvoiceCalculationService } from './calculation/invoice-calculation.service';
import { InvoiceController } from './invoice.controller';
import { InvoiceMapper } from './invoice.mapper';
import { InvoiceRepository } from './invoice.repository';
import { InvoiceService } from './invoice.service';
import { PdfModule } from './pdf/pdf.module';

@Module({
  imports: [CompanyModule, CustomerModule, ServiceCatalogModule, PdfModule],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceRepository, InvoiceCalculationService, InvoiceMapper],
})
export class InvoiceModule {}
