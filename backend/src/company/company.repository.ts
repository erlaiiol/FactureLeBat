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

  // Built explicitly (not `data: data`) so an omitted optional field clears
  // to null instead of leaving the previous value in place — same reasoning
  // as ProductRepository.update/ServiceCatalogRepository.update: PATCH here
  // is a full replace of the editable fields, not a partial patch. This
  // matters most for microEntrepreneurCeiling (Phase 17): an artisan must be
  // able to clear a previously-set plafond back to "no warning shown", not
  // just change it to a different number.
  update(companyId: string, data: UpdateCompanyDto): Promise<Company> {
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: data.name,
        siret: data.siret,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2 ?? null,
        postalCode: data.postalCode,
        city: data.city,
        email: data.email ?? null,
        phone: data.phone ?? null,
        legalStatus: data.legalStatus,
        vatRateBasisPoints: data.vatRateBasisPoints,
        invoiceNumberPrefix: data.invoiceNumberPrefix,
        declarationFrequency: data.declarationFrequency,
        microEntrepreneurCeiling: data.microEntrepreneurCeiling ?? null,
        cotisationVenteBasisPoints: data.cotisationVenteBasisPoints,
        cotisationPrestationBicBasisPoints: data.cotisationPrestationBicBasisPoints,
        cotisationPrestationBncBasisPoints: data.cotisationPrestationBncBasisPoints,
        versementLiberatoireOptIn: data.versementLiberatoireOptIn,
      },
    });
  }
}
