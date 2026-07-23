import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ServiceModel as Service } from '../../generated/prisma/models';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServiceCatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Capped rather than paginated for now — same trade-off as
  // ProductRepository/CustomerRepository/InvoiceRepository: bounds query
  // cost and response size as the catalog grows instead of ever fetching an
  // unbounded table. Revisit with real pagination once an artisan's service
  // list is large enough that "first 500 alphabetically" stops being
  // everything.
  private static readonly MAX_LISTED_SERVICES = 500;

  findAll(companyId: string, search?: string): Promise<Service[]> {
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
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<Service | null> {
    return this.prisma.service.findFirst({ where: { id, companyId } });
  }

  create(companyId: string, data: CreateServiceDto): Promise<Service> {
    return this.prisma.service.create({
      data: {
        name: data.name,
        description: data.description,
        pricingMode: data.pricingMode,
        priceCents: data.priceCents ?? null,
        percentageBasisPoints: data.percentageBasisPoints ?? null,
        defaultVisibility: data.defaultVisibility,
        code: data.code,
        companyId,
      },
    });
  }

  // updateMany (not update): see CustomerRepository.update's comment — same
  // reasoning applies to every tenant-scoped repository in this retrofit.
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place — same reasoning
  // as ProductRepository.update. priceCents/percentageBasisPoints are
  // explicitly nulled to whichever the new pricingMode doesn't use (Service
  // PricingConsistency guarantees exactly one is set on the incoming DTO) so
  // switching a service between FIXED and PERCENTAGE never leaves a stale
  // value from the previous mode behind.
  async update(companyId: string, id: string, data: UpdateServiceDto): Promise<Service> {
    const { count } = await this.prisma.service.updateMany({
      where: { id, companyId },
      data: {
        name: data.name,
        description: data.description ?? null,
        pricingMode: data.pricingMode,
        priceCents: data.priceCents ?? null,
        percentageBasisPoints: data.percentageBasisPoints ?? null,
        defaultVisibility: data.defaultVisibility,
        code: data.code ?? null,
      },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.service.findFirstOrThrow({ where: { id, companyId } });
  }
}
