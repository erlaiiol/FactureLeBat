import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductModel as Product } from '../../generated/prisma/models';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Capped rather than paginated for now — same trade-off as
  // InvoiceRepository.findAll(): bounds query cost and response size as the
  // catalog grows instead of ever fetching an unbounded table. Revisit with
  // real pagination once an artisan's catalog is large enough that "first
  // 500 alphabetically" stops being everything.
  private static readonly MAX_LISTED_PRODUCTS = 500;

  findAll(companyId: string, search?: string): Promise<Product[]> {
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
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<Product | null> {
    return this.prisma.product.findFirst({ where: { id, companyId } });
  }

  create(companyId: string, data: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data: { ...data, companyId } });
  }

  // updateMany (not update): see CustomerRepository.update's comment — same
  // reasoning applies to every tenant-scoped repository in this retrofit.
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  async update(companyId: string, id: string, data: UpdateProductDto): Promise<Product> {
    const { count } = await this.prisma.product.updateMany({
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
    return this.prisma.product.findFirstOrThrow({ where: { id, companyId } });
  }
}
