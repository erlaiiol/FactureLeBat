import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { LegalStatus } from '../../generated/prisma/enums';
import { CompanyModel as Company } from '../../generated/prisma/models';
import { SINGLETON_COMPANY_ID } from './company.constants';
import { UpdateCompanyDto } from './dto/update-company.dto';

const DEFAULT_COMPANY = {
  id: SINGLETON_COMPANY_ID,
  name: 'Mon entreprise',
  siret: '',
  addressLine1: '',
  postalCode: '',
  city: '',
  legalStatus: LegalStatus.MICRO_ENTREPRENEUR,
} as const;

@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  // upsert (not findUnique + create) so two concurrent "first ever" requests
  // can't both observe no row and both try to INSERT the same fixed id —
  // the second would otherwise fail with a unique-constraint violation.
  findOrCreateDefault(): Promise<Company> {
    return this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: {},
      create: DEFAULT_COMPANY,
    });
  }

  // Also an upsert, for the same reason: a PATCH can legitimately be the
  // very first write (no prior GET), so the row may not exist yet.
  update(data: UpdateCompanyDto): Promise<Company> {
    return this.prisma.company.upsert({
      where: { id: SINGLETON_COMPANY_ID },
      update: data,
      create: { id: SINGLETON_COMPANY_ID, ...data },
    });
  }
}
