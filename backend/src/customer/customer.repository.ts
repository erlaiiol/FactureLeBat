import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CustomerModel as Customer } from '../../generated/prisma/models';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Capped rather than paginated for now — same trade-off as
  // InvoiceRepository.findAll(): bounds query cost and response size as
  // customers accumulate instead of ever fetching an unbounded table.
  // Revisit with real pagination once an artisan's customer list is large
  // enough that "first 500 alphabetically" stops being everything.
  private static readonly MAX_LISTED_CUSTOMERS = 500;

  findAll(companyId: string, search?: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { companyName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: CustomerRepository.MAX_LISTED_CUSTOMERS,
    });
  }

  // findFirst (not findUnique) so the companyId filter can be part of the
  // same query — a cross-tenant id must read as a plain 404, never leak
  // whether the row exists for someone else.
  findById(companyId: string, id: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, companyId } });
  }

  create(companyId: string, data: CreateCustomerDto): Promise<Customer> {
    return this.prisma.customer.create({ data: { ...data, companyId } });
  }

  // updateMany (not update) since the unique `where` Prisma's typed
  // .update() accepts can't also carry companyId as an extra filter — the
  // affected count is how a genuine 404 is told apart from a cross-tenant
  // id (see NoRowsAffectedError).
  //
  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  async update(companyId: string, id: string, data: UpdateCustomerDto): Promise<Customer> {
    const { count } = await this.prisma.customer.updateMany({
      where: { id, companyId },
      data: {
        name: data.name,
        companyName: data.companyName ?? null,
        address: data.address ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        siret: data.siret ?? null,
      },
    });
    if (count === 0) {
      throw new NoRowsAffectedError();
    }
    return this.prisma.customer.findFirstOrThrow({ where: { id, companyId } });
  }
}
