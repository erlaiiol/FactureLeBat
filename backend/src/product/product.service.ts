import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PlanGateService } from '../billing/plan-gate.service';
import { CatalogFolderService } from '../catalog-folder/catalog-folder.service';
import { FuzzyMatch } from '../common/fuzzy-match';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { MarginConfig } from '../common/margin.util';
import { ProductRepository } from './product.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductProfile } from './entities/product.entity';
import { ProductModel } from '../../generated/prisma/models';

@Injectable()
export class ProductService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly planGateService: PlanGateService,
    private readonly catalogFolderService: CatalogFolderService,
  ) {}

  findAll(companyId: string, search?: string): Promise<ProductProfile[]> {
    return this.productRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<ProductProfile> {
    const product = await this.productRepository.findById(companyId, id);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  // Phase 1.4-1: lenient counterpart of findById, same reasoning as
  // CustomerService.findByIdOrNull — the voice-draft endpoint re-validates
  // an LLM-proposed productId and must treat a stale/forged one as "not
  // found" rather than a thrown exception.
  findByIdOrNull(companyId: string, id: string): Promise<ProductProfile | null> {
    return this.productRepository.findById(companyId, id);
  }

  // Phase 1.4-1: typo/voice-transcription-tolerant search — see
  // ProductRepository.searchFuzzy.
  searchFuzzy(companyId: string, query: string): Promise<FuzzyMatch<ProductModel>[]> {
    return this.productRepository.searchFuzzy(companyId, query);
  }

  // Phase 1.6: batch margin lookup for ReportsService.getMarginAnalytics —
  // see ProductRepository.findMarginConfigByIds.
  findMarginConfigByIds(companyId: string, ids: string[]): Promise<Map<string, MarginConfig>> {
    return this.productRepository.findMarginConfigByIds(companyId, ids);
  }

  // Phase 30: catalog-size cap (products + services combined) — see
  // docs/roadmap.md Phase 30 and CustomerService.create's equivalent check.
  async create(companyId: string, dto: CreateProductDto): Promise<ProductProfile> {
    await this.planGateService.assertCatalogCapacity(companyId, 'catalogItem');
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    try {
      return await this.productRepository.create(companyId, dto, folderIds);
    } catch (error) {
      throw this.mapKnownError(error);
    }
  }

  // Reports "not found"/"code already used" from the write itself rather
  // than a separate findById pre-check — same TOCTOU-avoidance reasoning as
  // before this retrofit, now via NoRowsAffectedError (see
  // ProductRepository.update) instead of Prisma's own P2025, which only
  // fires for .update()/.delete(), not the *Many variants a compound
  // {id, companyId} filter requires.
  async update(companyId: string, id: string, dto: UpdateProductDto): Promise<ProductProfile> {
    const folderIds = await this.catalogFolderService.filterOwnedFolderIds(
      companyId,
      dto.folderIds ?? [],
    );
    try {
      return await this.productRepository.update(companyId, id, dto, folderIds);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Product ${id} not found`);
      }
      throw this.mapKnownError(error);
    }
  }

  // `code` is unique per company (@@unique([companyId, code])) — P2002 is
  // Prisma's generic unique-constraint-violation code, turned into a clean
  // 409 instead of an unhandled 500 from the raw DB error.
  private mapKnownError(error: unknown): unknown {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictException('Ce code produit est déjà utilisé.');
    }
    return error;
  }
}
