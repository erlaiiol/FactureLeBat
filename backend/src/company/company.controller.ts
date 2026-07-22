import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CompanyService } from './company.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyProfile } from './entities/company.entity';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  getProfile(): Promise<CompanyProfile> {
    return this.companyService.getProfile();
  }

  @Patch()
  updateProfile(@Body() dto: UpdateCompanyDto): Promise<CompanyProfile> {
    return this.companyService.updateProfile(dto);
  }
}
