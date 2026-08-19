import { Injectable, NotFoundException } from '@nestjs/common';
import { PlanGateService } from '../billing/plan-gate.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CatalogFolderRepository } from './catalog-folder.repository';
import { CreateCatalogFolderDto } from './dto/create-catalog-folder.dto';
import { UpdateCatalogFolderDto } from './dto/update-catalog-folder.dto';
import { CatalogFolderProfile } from './entities/catalog-folder.entity';

@Injectable()
export class CatalogFolderService {
  constructor(
    private readonly catalogFolderRepository: CatalogFolderRepository,
    private readonly planGateService: PlanGateService,
  ) {}

  // Phase 1.1-2 amendment: Dossiers is Pro+/Premium-only — every read/write
  // below asserts feature access first, same "whole endpoint locked, not
  // just create" treatment as analytics/AI assistant (see PlanGateService.
  // assertFeatureAccess). Nothing here ever deletes a CatalogFolder row or
  // its Product/Service/Discount join rows on downgrade — an Essentiel
  // company just can't reach any of these methods until back at Pro+, and
  // everything reappears exactly as left the moment they are.
  async findAll(companyId: string, search?: string): Promise<CatalogFolderProfile[]> {
    await this.planGateService.assertFeatureAccess(companyId, 'dossiers');
    return this.catalogFolderRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<CatalogFolderProfile> {
    await this.planGateService.assertFeatureAccess(companyId, 'dossiers');
    const folder = await this.catalogFolderRepository.findById(companyId, id);
    if (!folder) {
      throw new NotFoundException(`CatalogFolder ${id} not found`);
    }
    return folder;
  }

  // No PlanGateService.assertCatalogCapacity check — a folder holds no
  // billable content of its own, so no numeric cap makes sense here, only
  // the tier gate above.
  async create(companyId: string, dto: CreateCatalogFolderDto): Promise<CatalogFolderProfile> {
    await this.planGateService.assertFeatureAccess(companyId, 'dossiers');
    return this.catalogFolderRepository.create(companyId, dto);
  }

  // Reports "not found" from the write itself — same TOCTOU-avoidance
  // reasoning as ProductService.update/DiscountService.update.
  async update(
    companyId: string,
    id: string,
    dto: UpdateCatalogFolderDto,
  ): Promise<CatalogFolderProfile> {
    await this.planGateService.assertFeatureAccess(companyId, 'dossiers');
    try {
      return await this.catalogFolderRepository.update(companyId, id, dto);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`CatalogFolder ${id} not found`);
      }
      throw error;
    }
  }

  // Deliberately NOT feature-gated — called by Product/Service/
  // DiscountService on every one of their own create/update calls (which
  // stay available on every tier) to sync folderIds. Gating this would mean
  // an ordinary, unrelated edit (e.g. a price change) by a downgraded
  // artisan silently wipes their existing folder assignments the moment
  // they save, since those services always resend the item's current
  // folderIds — exactly the data loss this whole amendment is meant to
  // avoid. Ownership is still checked (see CatalogFolderRepository.
  // findIdsOwnedByCompany): a downgraded company can keep re-saving items
  // into folders it already owns, it just can't create/rename/browse/delete
  // folders themselves until back at Pro+.
  filterOwnedFolderIds(companyId: string, ids: string[]): Promise<string[]> {
    return this.catalogFolderRepository.findIdsOwnedByCompany(companyId, ids);
  }

  async delete(companyId: string, id: string): Promise<void> {
    await this.planGateService.assertFeatureAccess(companyId, 'dossiers');
    try {
      await this.catalogFolderRepository.delete(companyId, id);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`CatalogFolder ${id} not found`);
      }
      throw error;
    }
  }
}
