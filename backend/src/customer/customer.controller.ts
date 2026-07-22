import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerProfile } from './entities/customer.entity';

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(@Query('search') search?: string): Promise<CustomerProfile[]> {
    return this.customerService.findAll(search);
  }

  @Get(':id')
  findById(@Param('id') id: string): Promise<CustomerProfile> {
    return this.customerService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto): Promise<CustomerProfile> {
    return this.customerService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto): Promise<CustomerProfile> {
    return this.customerService.update(id, dto);
  }
}
