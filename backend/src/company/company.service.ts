import { Injectable } from '@nestjs/common';
import { CompanyLogoData, CompanyRepository } from './company.repository';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyProfile } from './entities/company.entity';

@Injectable()
export class CompanyService {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async getProfile(companyId: string): Promise<CompanyProfile> {
    const [company, hasLogo] = await Promise.all([
      this.companyRepository.findById(companyId),
      this.companyRepository.hasLogo(companyId),
    ]);
    return { ...company, hasLogo };
  }

  async updateProfile(companyId: string, dto: UpdateCompanyDto): Promise<CompanyProfile> {
    const [company, hasLogo] = await Promise.all([
      this.companyRepository.update(companyId, dto),
      this.companyRepository.hasLogo(companyId),
    ]);
    return { ...company, hasLogo };
  }

  // Phase: top-right invoice logo. Only PdfService's PDF-building path and
  // GET /company/logo need the actual bytes — see CompanyRepository.findLogo's
  // comment for why this is never folded into getProfile above.
  getLogo(companyId: string): Promise<CompanyLogoData | null> {
    return this.companyRepository.findLogo(companyId);
  }

  async uploadLogo(companyId: string, data: CompanyLogoData): Promise<CompanyProfile> {
    await this.companyRepository.upsertLogo(companyId, data);
    return this.getProfile(companyId);
  }

  async removeLogo(companyId: string): Promise<CompanyProfile> {
    await this.companyRepository.deleteLogo(companyId);
    return this.getProfile(companyId);
  }
}
