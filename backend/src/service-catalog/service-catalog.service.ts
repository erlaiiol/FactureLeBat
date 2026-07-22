import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceProfile } from './entities/service.entity';

@Injectable()
export class ServiceCatalogService {
  constructor(private readonly serviceCatalogRepository: ServiceCatalogRepository) {}

  findAll(search?: string): Promise<ServiceProfile[]> {
    return this.serviceCatalogRepository.findAll(search);
  }

  async findById(id: string): Promise<ServiceProfile> {
    const service = await this.serviceCatalogRepository.findById(id);
    if (!service) {
      throw new NotFoundException(`Service ${id} not found`);
    }
    return service;
  }

  async create(dto: CreateServiceDto): Promise<ServiceProfile> {
    try {
      return await this.serviceCatalogRepository.create(dto);
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Reports "not found" from the write itself rather than a separate
  // findById pre-check — same TOCTOU-avoidance reasoning as
  // ProductService.update/CustomerService.update.
  async update(id: string, dto: UpdateServiceDto): Promise<ServiceProfile> {
    try {
      return await this.serviceCatalogRepository.update(id, dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Service ${id} not found`);
      }
      throw this.mapKnownError(error);
    }
  }

  // `code` is the first unique non-id field on this model — same P2002 →
  // clean 409 mapping as ProductService.
  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ce code de prestation est déjà utilisé.');
    }
    return error;
  }
}
