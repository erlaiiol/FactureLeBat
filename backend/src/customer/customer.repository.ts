import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CustomerModel as Customer } from '../../generated/prisma/models';
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

  findAll(search?: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { companyName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      take: CustomerRepository.MAX_LISTED_CUSTOMERS,
    });
  }

  findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { id } });
  }

  create(data: CreateCustomerDto): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place: Prisma omits
  // `undefined` keys from an update entirely, which would otherwise turn
  // this into a partial patch despite the "full replace" PATCH contract.
  update(id: string, data: UpdateCustomerDto): Promise<Customer> {
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        companyName: data.companyName ?? null,
        address: data.address ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        siret: data.siret ?? null,
      },
    });
  }
}
