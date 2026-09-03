import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ServiceModel as Service } from '../../generated/prisma/models';
import { FuzzyMatch } from '../common/fuzzy-match';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { MarginConfig } from '../common/margin.util';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { ServiceProfile } from './entities/service.entity';

// Selects just id/name — see CatalogFolderRef.
const FOLDERS_INCLUDE = { folders: { select: { id: true, name: true } } } as const;

@Injectable()
export class ServiceCatalogRepository {
  // Capped rather than paginated for now — same trade-off as
  // ProductRepository/CustomerRepository/InvoiceRepository: bounds query
  // cost and response size as the catalog grows instead of ever fetching an
  // unbounded table. Revisit with real pagination once an artisan's service
  // list is large enough that "first 500 alphabetically" stops being
  // everything.
  private static readonly MAX_LISTED_SERVICES = 500;

  // See CustomerRepository's identical pair of constants for the reasoning
  // — same "small candidate list, tuned generously low" trade-off, needed
  // here for the same voice-draft use case (Phase 1.4-1).
  private static readonly FUZZY_SEARCH_LIMIT = 5;
  private static readonly FUZZY_SIMILARITY_THRESHOLD = 0.2;

  constructor(private readonly prisma: PrismaService) {}

  // Phase 1.4-1: typo/voice-transcription-tolerant search for the
  // voice-draft endpoint — see CustomerRepository.searchFuzzy's identical
  // comment. Plain rows, not ServiceProfile: the folders relation this
  // repository's other reads include isn't meaningful to an LLM tool
  // result, and SELECT * over raw SQL can't fetch a relation anyway.
  async searchFuzzy(companyId: string, query: string): Promise<FuzzyMatch<Service>[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<Array<Service & { score: number }>>`
      SELECT *, GREATEST(
        similarity(lower(name), lower(${trimmed})),
        similarity(lower(coalesce(code, '')), lower(${trimmed}))
      ) AS score
      FROM "Service"
      WHERE "companyId" = ${companyId}
        AND (
          similarity(lower(name), lower(${trimmed})) > ${ServiceCatalogRepository.FUZZY_SIMILARITY_THRESHOLD}
          OR similarity(lower(code), lower(${trimmed})) > ${ServiceCatalogRepository.FUZZY_SIMILARITY_THRESHOLD}
        )
      ORDER BY score DESC
      LIMIT ${ServiceCatalogRepository.FUZZY_SEARCH_LIMIT}
    `;
    return rows.map(({ score, ...row }) => ({ row: row, score: Number(score) }));
  }

  findAll(companyId: string, search?: string): Promise<ServiceProfile[]> {
    return this.prisma.service.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: ServiceCatalogRepository.MAX_LISTED_SERVICES,
      include: FOLDERS_INCLUDE,
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<ServiceProfile | null> {
    return this.prisma.service.findFirst({ where: { id, companyId }, include: FOLDERS_INCLUDE });
  }

  // Phase 1.6: same batch margin lookup as ProductRepository.findMarginConfigByIds,
  // for ReportsService.getMarginAnalytics.
  async findMarginConfigByIds(
    companyId: string,
    ids: string[],
  ): Promise<Map<string, MarginConfig>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.service.findMany({
      where: { companyId, id: { in: ids } },
      select: {
        id: true,
        marginMode: true,
        marginAmountCents: true,
        marginPercentageBasisPoints: true,
      },
    });
    return new Map(rows.map(({ id, ...config }) => [id, config]));
  }

  // folderIds is already filtered to this company's own folders (see
  // CatalogFolderService.filterOwnedFolderIds, called from
  // ServiceCatalogService) before it ever reaches here.
  create(companyId: string, data: CreateServiceDto, folderIds: string[]): Promise<ServiceProfile> {
    return this.prisma.service.create({
      data: {
        name: data.name,
        description: data.description,
        pricingMode: data.pricingMode,
        priceCents: data.priceCents ?? null,
        percentageBasisPoints: data.percentageBasisPoints ?? null,
        defaultVisibility: data.defaultVisibility,
        code: data.code,
        activityCategory: data.activityCategory ?? null,
        marginMode: data.marginMode ?? null,
        marginAmountCents: data.marginAmountCents ?? null,
        marginPercentageBasisPoints: data.marginPercentageBasisPoints ?? null,
        companyId,
        folders: { connect: folderIds.map((id) => ({ id })) },
      },
      include: FOLDERS_INCLUDE,
    });
  }

  // updateMany (not update): see CustomerRepository.update's comment — same
  // reasoning applies to every tenant-scoped repository in this retrofit.
  // updateMany can't write relations though, so the folder sync is a second,
  // plain `update` by bare id in the same transaction — safe only because
  // the updateMany above it already proved this id belongs to companyId.
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place — same reasoning
  // as ProductRepository.update. priceCents/percentageBasisPoints are
  // explicitly nulled to whichever the new pricingMode doesn't use (Service
  // PricingConsistency guarantees exactly one is set on the incoming DTO) so
  // switching a service between FIXED and PERCENTAGE never leaves a stale
  // value from the previous mode behind.
  async update(
    companyId: string,
    id: string,
    data: UpdateServiceDto,
    folderIds: string[],
  ): Promise<ServiceProfile> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.service.updateMany({
        where: { id, companyId },
        data: {
          name: data.name,
          description: data.description ?? null,
          pricingMode: data.pricingMode,
          priceCents: data.priceCents ?? null,
          percentageBasisPoints: data.percentageBasisPoints ?? null,
          defaultVisibility: data.defaultVisibility,
          code: data.code ?? null,
          activityCategory: data.activityCategory ?? null,
          marginMode: data.marginMode ?? null,
          marginAmountCents: data.marginAmountCents ?? null,
          marginPercentageBasisPoints: data.marginPercentageBasisPoints ?? null,
        },
      });
      if (count === 0) {
        throw new NoRowsAffectedError();
      }
      return tx.service.update({
        where: { id },
        data: { folders: { set: folderIds.map((folderId) => ({ id: folderId })) } },
        include: FOLDERS_INCLUDE,
      });
    });
  }
}
