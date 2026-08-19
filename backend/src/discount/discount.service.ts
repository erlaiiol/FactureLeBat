import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanGateService } from '../billing/plan-gate.service';
import { CatalogFolderService } from '../catalog-folder/catalog-folder.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { DiscountRepository } from './discount.repository';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { DiscountProfile } from './entities/discount.entity';

@Injectable()
export class DiscountService {
  constructor(
    private readonly discountRepository: DiscountRepository,
    private readonly planGateService: PlanGateService,
    private readonly catalogFolderService: CatalogFolderService,
  ) {}

  findAll(companyId: string, search?: string): Promise<DiscountProfile[]> {
    return this.discountRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<DiscountProfile> {
    const discount = await this.discountRepository.findById(companyId, id);
    if (!discount) {
      throw new NotFoundException(`Discount ${id} not found`);
    }
    return discount;
  }

  // Phase 30: catalog-size cap (products + services + discounts combined) —
  // see docs/roadmap.md Phase 30 and ServiceCatalogService.create's
  // equivalent check.
  async create(companyId: string, dto: CreateDiscountDto): Promise<DiscountProfile> {
    await this.planGateService.assertCatalogCapacity(companyId, 'catalogItem');
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    return this.discountRepository.create(companyId, dto, folderIds);
  }

  // Reports "not found" from the write itself — same TOCTOU-avoidance
  // reasoning as ProductService.update, via NoRowsAffectedError.
  async update(companyId: string, id: string, dto: UpdateDiscountDto): Promise<DiscountProfile> {
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    try {
      return await this.discountRepository.update(companyId, id, dto, folderIds);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Discount ${id} not found`);
      }
      throw error;
    }
  }
}
