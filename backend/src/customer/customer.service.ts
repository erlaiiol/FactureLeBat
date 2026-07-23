import { Injectable, NotFoundException } from '@nestjs/common';
import { NoRowsAffectedError } from '../common/errors/no-rows-affected.error';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerProfile } from './entities/customer.entity';

@Injectable()
export class CustomerService {
  constructor(private readonly customerRepository: CustomerRepository) {}

  findAll(companyId: string, search?: string): Promise<CustomerProfile[]> {
    return this.customerRepository.findAll(companyId, search);
  }

  async findById(companyId: string, id: string): Promise<CustomerProfile> {
    const customer = await this.customerRepository.findById(companyId, id);
    if (!customer) {
      throw new NotFoundException(`Customer ${id} not found`);
    }
    return customer;
  }

  create(companyId: string, dto: CreateCustomerDto): Promise<CustomerProfile> {
    return this.customerRepository.create(companyId, dto);
  }

  // Reports "not found" from the write itself rather than a separate
  // findById pre-check: a check-then-act pair leaves a window where a
  // concurrent request could remove the row between the two calls, turning
  // a legitimate 404 into an unhandled 500 from Prisma's own not-found
  // error. Catching it here closes that race and saves a round trip.
  async update(companyId: string, id: string, dto: UpdateCustomerDto): Promise<CustomerProfile> {
    try {
      return await this.customerRepository.update(companyId, id, dto);
    } catch (error) {
      if (error instanceof NoRowsAffectedError) {
        throw new NotFoundException(`Customer ${id} not found`);
      }
      throw error;
    }
  }
}
