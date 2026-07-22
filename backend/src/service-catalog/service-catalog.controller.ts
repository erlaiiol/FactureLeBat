import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceProfile } from './entities/service.entity';

@Controller('services')
export class ServiceCatalogController {
  constructor(private readonly serviceCatalogService: ServiceCatalogService) {}

  @Get()
  findAll(@Query('search') search?: string): Promise<ServiceProfile[]> {
    return this.serviceCatalogService.findAll(search);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<ServiceProfile> {
    return this.serviceCatalogService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateServiceDto): Promise<ServiceProfile> {
    return this.serviceCatalogService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto): Promise<ServiceProfile> {
    return this.serviceCatalogService.update(id, dto);
  }
}
