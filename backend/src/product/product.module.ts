import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductRepository } from './product.repository';
import { ProductExtractionService } from './import/product-extraction.service';
import { ProductImportService } from './import/product-import.service';
import { SafeFetcherService } from './import/safe-fetcher.service';

@Module({
  controllers: [ProductController],
  providers: [
    ProductService,
    ProductRepository,
    ProductImportService,
    SafeFetcherService,
    ProductExtractionService,
  ],
  exports: [ProductService],
})
export class ProductModule {}
