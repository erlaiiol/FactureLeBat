import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DiscountModel as Discount } from '../../generated/prisma/models';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateDiscountDto } from './dto/create-discount.dto';
import { UpdateDiscountDto } from './dto/update-discount.dto';

@Injectable()
export class DiscountRepository {
  // Capped rather than paginated for now — same trade-off as
  // ProductRepository/ServiceCatalogRepository.
  private static readonly MAX_LISTED_DISCOUNTS = 500;

  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string, search?: string): Promise<Discount[]> {
    return this.prisma.discount.findMany({
      where: {
        companyId,
        ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      },
      orderBy: { name: 'asc' },
      take: DiscountRepository.MAX_LISTED_DISCOUNTS,
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<Discount | null> {
    return this.prisma.discount.findFirst({ where: { id, companyId } });
  }

  create(companyId: string, data: CreateDiscountDto): Promise<Discount> {
    return this.prisma.discount.create({
      data: {
        name: data.name,
        discountType: data.discountType,
        fixedAmountCents: data.fixedAmountCents ?? null,
        percentageBasisPoints: data.percentageBasisPoints ?? null,
        companyId,
      },
    });
  }

  // updateMany (not update): same cross-tenant-safety reasoning as
  // ProductRepository/ServiceCatalogRepository.update. fixedAmountCents/
  // percentageBasisPoints are explicitly nulled to whichever the new
  // discountType doesn't use (DiscountConsistency guarantees exactly one is
  // set on the incoming DTO) so switching a discount between FIXED and
  // PERCENTAGE never leaves a stale value from the previous mode behind.
  async update(companyId: string, id: string, data: UpdateDiscountDto): Promise<Discount> {
    const { count } = await this.prisma.discount.updateMany({
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
    return this.prisma.discount.findFirstOrThrow({ where: { id, companyId } });
  }
}
