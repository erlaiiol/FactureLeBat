import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProductModel as Product } from '../../generated/prisma/models';
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

  findAll(search?: string): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { supplierName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: ProductRepository.MAX_LISTED_PRODUCTS,
    });
  }

  findById(id: string): Promise<Product | null> {
    return this.prisma.product.findUnique({ where: { id } });
  }

  create(data: CreateProductDto): Promise<Product> {
    return this.prisma.product.create({ data });
  }

  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  update(id: string, data: UpdateProductDto): Promise<Product> {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description ?? null,
        unit: data.unit,
        priceCents: data.priceCents,
        supplierName: data.supplierName ?? null,
        supplierUrl: data.supplierUrl ?? null,
      },
    });
  }
}
