import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PlanGateService } from '../billing/plan-gate.service';
import { CatalogFolderService } from '../catalog-folder/catalog-folder.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { ServiceCatalogRepository } from './service-catalog.repository';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceProfile } from './entities/service.entity';

@Injectable()
export class ServiceCatalogService {
  constructor(
    private readonly serviceCatalogRepository: ServiceCatalogRepository,
    private readonly planGateService: PlanGateService,
    private readonly catalogFolderService: CatalogFolderService,
  ) {}

  findAll(companyId: string, search?: string): Promise<ServiceProfile[]> {
    return this.serviceCatalogRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<ServiceProfile> {
    const service = await this.serviceCatalogRepository.findById(companyId, id);
    if (!service) {
      throw new NotFoundException(`Service ${id} not found`);
    }
    return service;
  }

  // Phase 30: catalog-size cap (products + services combined) — see
  // docs/roadmap.md Phase 30 and CustomerService.create's equivalent check.
  async create(companyId: string, dto: CreateServiceDto): Promise<ServiceProfile> {
    await this.planGateService.assertCatalogCapacity(companyId, 'catalogItem');
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    try {
      return await this.serviceCatalogRepository.create(companyId, dto, folderIds);
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Reports "not found"/"code already used" from the write itself — same
  // TOCTOU-avoidance reasoning as ProductService.update/CustomerService.update,
  // now via NoRowsAffectedError (see ServiceCatalogRepository.update).
  async update(companyId: string, id: string, dto: UpdateServiceDto): Promise<ServiceProfile> {
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    try {
      return await this.serviceCatalogRepository.update(companyId, id, dto, folderIds);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Service ${id} not found`);
      }
      throw this.mapKnownError(error);
    }
  }

  // `code` is unique per company (@@unique([companyId, code])) — same P2002
  // → clean 409 mapping as ProductService.
  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ce code de prestation est déjà utilisé.');
    }
    return error;
  }
}
