import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CatalogFolderModel as CatalogFolder } from '../../generated/prisma/models';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateCatalogFolderDto } from './dto/create-catalog-folder.dto';
import { UpdateCatalogFolderDto } from './dto/update-catalog-folder.dto';

@Injectable()
export class CatalogFolderRepository {
  // Capped rather than paginated for now — same trade-off as
  // ProductRepository/ServiceCatalogRepository/DiscountRepository.
  private static readonly MAX_LISTED_FOLDERS = 500;

  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string, search?: string): Promise<CatalogFolder[]> {
    return this.prisma.catalogFolder.findMany({
      where: {
        companyId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: CatalogFolderRepository.MAX_LISTED_FOLDERS,
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<CatalogFolder | null> {
    return this.prisma.catalogFolder.findFirst({ where: { id, companyId } });
  }

  // Cross-tenant-safety filter for Product/Service/Discount's folderIds
  // input: rather than trusting an artisan-supplied id list outright (which
  // could otherwise attach a catalog item to another tenant's folder, or let
  // an artisan probe for the existence of a stray id), only the subset that
  // actually belongs to this company is ever passed on to the m2m
  // connect/set call — see ProductRepository.create/update and its siblings.
  async findIdsOwnedByCompany(companyId: string, ids: string[]): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.catalogFolder.findMany({
      where: { id: { in: ids }, companyId },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  create(companyId: string, data: CreateCatalogFolderDto): Promise<CatalogFolder> {
    return this.prisma.catalogFolder.create({
      data: { name: data.name, companyId },
    });
  }

  async update(
    companyId: string,
    id: string,
    data: UpdateCatalogFolderDto,
  ): Promise<CatalogFolder> {
    const { count } = await this.prisma.catalogFolder.updateMany({
      where: { id, companyId },
      data: { name: data.name },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.catalogFolder.findFirstOrThrow({ where: { id, companyId } });
  }

  // deleteMany (not delete): same cross-tenant-safety reasoning as every
  // other tenant-scoped repository's update — a cross-tenant id must read as
  // a plain 404, never a raw P2025 from a single-row delete(). The m2m join
  // rows to Product/Service/Discount are dropped automatically by Postgres
  // (Prisma's implicit m2m join table has no FK constraint blocking this);
  // the items themselves are untouched, just left with one fewer folder.
  async delete(companyId: string, id: string): Promise<void> {
    const { count } = await this.prisma.catalogFolder.deleteMany({ where: { id, companyId } });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
  }
}
