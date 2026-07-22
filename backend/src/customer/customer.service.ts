import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerProfile } from './entities/customer.entity';

@Injectable()
export class CustomerService {
  constructor(private readonly customerRepository: CustomerRepository) {}

  findAll(search?: string): Promise<CustomerProfile[]> {
    return this.customerRepository.findAll(search);
  }

  async findById(id: string): Promise<CustomerProfile> {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  create(dto: CreateCustomerDto): Promise<CustomerProfile> {
    return this.customerRepository.create(dto);
  }

  // Reports "not found" from the write itself rather than a separate
  // findById pre-check: a check-then-act pair leaves a window where a
  // concurrent request could remove the row between the two calls, turning
  // a legitimate 404 into an unhandled 500 from Prisma's own not-found
  // error (P2025). Catching it here closes that race and saves a round trip.
  async update(id: string, dto: UpdateCustomerDto): Promise<CustomerProfile> {
    try {
      return await this.customerRepository.update(id, dto);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      throw error;
    }
  }
}
