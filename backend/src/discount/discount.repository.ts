import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';
import { DiscountProfile } from './entities/discount.entity';

// Selects just id/name — see CatalogFolderRef.
const FOLDERS_INCLUDE = { folders: { select: { id: true, name: true } } } as const;

@Injectable()
export class DiscountRepository {
  // Capped rather than paginated for now — same trade-off as
  // ProductRepository/ServiceCatalogRepository.
  private static readonly MAX_LISTED_DISCOUNTS = 500;

  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string, search?: string): Promise<DiscountProfile[]> {
    return this.prisma.discount.findMany({
      where: {
        companyId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: DiscountRepository.MAX_LISTED_DISCOUNTS,
      include: FOLDERS_INCLUDE,
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<DiscountProfile | null> {
    return this.prisma.discount.findFirst({ where: { id, companyId }, include: FOLDERS_INCLUDE });
  }

  // folderIds is already filtered to this company's own folders (see
  // CatalogFolderService.filterOwnedFolderIds, called from DiscountService)
  // before it ever reaches here.
  create(
    companyId: string,
    data: CreateDiscountDto,
    folderIds: string[],
  ): Promise<DiscountProfile> {
    return this.prisma.discount.create({
      data: {
        name: data.name,
        discountType: data.discountType,
        fixedAmountCents: data.fixedAmountCents ?? null,
        percentageBasisPoints: data.percentageBasisPoints ?? null,
        companyId,
        folders: { connect: folderIds.map((id) => ({ id })) },
      },
      include: FOLDERS_INCLUDE,
    });
  }

  // updateMany (not update): same cross-tenant-safety reasoning as
  // ProductRepository/ServiceCatalogRepository.update. fixedAmountCents/
  // percentageBasisPoints are explicitly nulled to whichever the new
  // discountType doesn't use (DiscountConsistency guarantees exactly one is
  // set on the incoming DTO) so switching a discount between FIXED and
  // PERCENTAGE never leaves a stale value from the previous mode behind.
  // updateMany can't write relations though, so the folder sync is a second,
  // plain `update` by bare id in the same transaction — safe only because
  // the updateMany above it already proved this id belongs to companyId.
  async update(
    companyId: string,
    id: string,
    data: UpdateDiscountDto,
    folderIds: string[],
  ): Promise<DiscountProfile> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.discount.updateMany({
        where: { id, companyId },
        data: {
          name: data.name,
          discountType: data.discountType,
          fixedAmountCents: data.fixedAmountCents ?? null,
          percentageBasisPoints: data.percentageBasisPoints ?? null,
        },
      });
      if (count === 0) {
        throw new NoRowsAffectedError();
      }
      return tx.discount.update({
        where: { id },
        data: { folders: { set: folderIds.map((folderId) => ({ id: folderId })) } },
        include: FOLDERS_INCLUDE,
      });
    });
  }
}
