import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyRepository } from './company.repository';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService, CompanyRepository],
  // CompanyRepository exported directly (not just CompanyService) for Phase
  // 1.2-4's e-invoicing module to read/write the SUPER PDP token columns —
  // same "export the repository too" precedent as InvoiceModule exporting
  // InvoiceRepository for ReportsModule.
  exports: [CompanyService, CompanyRepository],
})
export class CompanyModule {}
