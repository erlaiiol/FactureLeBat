import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CompanyModel as Company } from '../../generated/prisma/models';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Phase 13: a Company row now always exists by the time an authenticated
  // request can reach here (it's created alongside its User at registration,
  // see auth/repositories/user.repository.ts) — plain findUniqueOrThrow,
  // no more upsert-on-first-write.
  findById(companyId: string): Promise<Company> {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  update(companyId: string, data: UpdateCompanyDto): Promise<Company> {
    return this.prisma.company.update({ where: { id: companyId }, data });
  }
}
