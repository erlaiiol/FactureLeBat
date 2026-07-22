import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ServiceModel as Service } from '../../generated/prisma/models';
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

  findAll(search?: string): Promise<Service[]> {
    return this.prisma.service.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: ServiceCatalogRepository.MAX_LISTED_SERVICES,
    });
  }

  findById(id: string): Promise<Service | null> {
    return this.prisma.service.findUnique({ where: { id } });
  }

  create(data: CreateServiceDto): Promise<Service> {
    return this.prisma.service.create({ data });
  }

  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place — same reasoning
  // as ProductRepository.update.
  update(id: string, data: UpdateServiceDto): Promise<Service> {
    return this.prisma.service.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        priceCents: data.priceCents,
        defaultVisibility: data.defaultVisibility,
        code: data.code ?? null,
      },
    });
  }
}
