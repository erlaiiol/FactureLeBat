import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { CatalogFolderModule } from '../catalog-folder/catalog-folder.module';
import { DiscountController } from './discount.controller';
import { DiscountService } from './discount.service';
import { DiscountRepository } from './discount.repository';

@Module({
  imports: [BillingModule, CatalogFolderModule],
  controllers: [DiscountController],
  providers: [DiscountService, DiscountRepository],
  exports: [DiscountService],
})
export class DiscountModule {}
