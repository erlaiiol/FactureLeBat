import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogFolderController } from './catalog-folder.controller';
import { CatalogFolderService } from './catalog-folder.service';
import { CatalogFolderRepository } from './catalog-folder.repository';

@Module({
  imports: [BillingModule],
  controllers: [CatalogFolderController],
  providers: [CatalogFolderService, CatalogFolderRepository],
  exports: [CatalogFolderService],
})
export class CatalogFolderModule {}
