import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductModel as Product } from '../../generated/prisma/models';
import { FuzzyMatch } from '../common/fuzzy-match';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductProfile } from './entities/product.entity';

// Selects just id/name — see CatalogFolderRef.
const FOLDERS_INCLUDE = { folders: { select: { id: true, name: true } } } as const;

@Injectable()
export class ProductRepository {
  // Capped rather than paginated for now — same trade-off as
  // InvoiceRepository.findAll(): bounds query cost and response size as the
  // catalog grows instead of ever fetching an unbounded table. Revisit with
  // real pagination once an artisan's catalog is large enough that "first
  // 500 alphabetically" stops being everything.
  private static readonly MAX_LISTED_PRODUCTS = 500;

  // See CustomerRepository's identical pair of constants for the reasoning
  // — same "small candidate list, tuned generously low" trade-off, needed
  // here for the same voice-draft use case (Phase 1.4-1).
  private static readonly FUZZY_SEARCH_LIMIT = 5;
  private static readonly FUZZY_SIMILARITY_THRESHOLD = 0.2;

  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string, search?: string): Promise<ProductProfile[]> {
    return this.prisma.product.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { supplierName: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: ProductRepository.MAX_LISTED_PRODUCTS,
      include: FOLDERS_INCLUDE,
    });
  }

  // Phase 1.4-1: typo/voice-transcription-tolerant search for the
  // voice-draft endpoint — see CustomerRepository.searchFuzzy's identical
  // comment. Plain rows, not ProductProfile: the folders relation this
  // repository's other reads include isn't meaningful to an LLM tool
  // result, and SELECT * over raw SQL can't fetch a relation anyway.
  async searchFuzzy(companyId: string, query: string): Promise<FuzzyMatch<Product>[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<Array<Product & { score: number }>>`
      SELECT *, GREATEST(
        similarity(lower(name), lower(${trimmed})),
        similarity(lower(coalesce(code, '')), lower(${trimmed}))
      ) AS score
      FROM "Product"
      WHERE "companyId" = ${companyId}
        AND (
          similarity(lower(name), lower(${trimmed})) > ${ProductRepository.FUZZY_SIMILARITY_THRESHOLD}
          OR similarity(lower(code), lower(${trimmed})) > ${ProductRepository.FUZZY_SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${ProductRepository.FUZZY_SEARCH_LIMIT}
    `;
    return rows.map(({ score, ...row }) => ({ row: row, score: Number(score) }));
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<ProductProfile | null> {
    return this.prisma.product.findFirst({ where: { id, companyId }, include: FOLDERS_INCLUDE });
  }

  // folderIds is already filtered to this company's own folders (see
  // CatalogFolderService.filterOwnedFolderIds, called from ProductService)
  // before it ever reaches here.
  create(companyId: string, data: CreateProductDto, folderIds: string[]): Promise<ProductProfile> {
    return this.prisma.product.create({
      data: {
        name: data.name,
        description: data.description,
        unit: data.unit,
        priceCents: data.priceCents,
        supplierName: data.supplierName,
        supplierUrl: data.supplierUrl,
        code: data.code,
        packagingQuantity: data.packagingQuantity,
        activityCategory: data.activityCategory,
        companyId,
        folders: { connect: folderIds.map((id) => ({ id })) },
      },
      include: FOLDERS_INCLUDE,
    });
  }

  // updateMany (not update): see CustomerRepository.update's comment — same
  // reasoning applies to every tenant-scoped repository in this retrofit.
  // updateMany can't write relations though, so the folder sync is a second,
  // plain `update` by bare id — safe only because the updateMany above it
  // (in the same transaction) already proved this id belongs to companyId;
  // count === 0 aborts before that second write ever runs.
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  async update(
    companyId: string,
    id: string,
    data: UpdateProductDto,
    folderIds: string[],
  ): Promise<ProductProfile> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.product.updateMany({
        where: { id, companyId },
        data: {
          name: data.name,
          description: data.description ?? null,
          unit: data.unit,
          priceCents: data.priceCents,
          supplierName: data.supplierName ?? null,
          supplierUrl: data.supplierUrl ?? null,
          code: data.code ?? null,
          packagingQuantity: data.packagingQuantity ?? null,
          activityCategory: data.activityCategory ?? null,
        },
      });
      if (count === 0) {
        throw new NoRowsAffectedError();
      }
      return tx.product.update({
        where: { id },
        data: { folders: { set: folderIds.map((folderId) => ({ id: folderId })) } },
        include: FOLDERS_INCLUDE,
      });
    });
  }
}
