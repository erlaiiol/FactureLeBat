import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { CustomerService } from './customer.service';
import type { CustomerSortBy } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerProfile, CustomerSearchResult } from './entities/customer.entity';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: CustomerSortBy,
  ): Promise<CustomerSearchResult[]> {
    return this.customerService.findAll(user.companyId, search, sortBy);
  }

  @Get(':id')
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CustomerProfile> {
    return this.customerService.findById(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCustomerDto,
  ): Promise<CustomerProfile> {
    return this.customerService.create(user.companyId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerProfile> {
    return this.customerService.update(user.companyId, id, dto);
  }
}
