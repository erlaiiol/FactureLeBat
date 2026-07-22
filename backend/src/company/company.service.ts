import { Injectable } from '@nestjs/common';
import { CompanyRepository } from './company.repository';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyProfile } from './entities/company.entity';

@Injectable()
export class CompanyService {
  constructor(private readonly companyRepository: CompanyRepository) {}

  getProfile(): Promise<CompanyProfile> {
    return this.companyRepository.findOrCreateDefault();
  }

  updateProfile(dto: UpdateCompanyDto): Promise<CompanyProfile> {
    return this.companyRepository.update(dto);
  }
}
