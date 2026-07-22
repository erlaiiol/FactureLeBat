import { Module } from '@nestjs/common';
import { ServiceCatalogController } from './service-catalog.controller';
import { ServiceCatalogService } from './service-catalog.service';
import { ServiceCatalogRepository } from './service-catalog.repository';

@Module({
  controllers: [ServiceCatalogController],
  providers: [ServiceCatalogService, ServiceCatalogRepository],
  exports: [ServiceCatalogService],
})
export class ServiceCatalogModule {}
