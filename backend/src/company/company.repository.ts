import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CompanyModel as Company } from '../../generated/prisma/models';
import { UpdateCompanyDto } from './dto/update-company.dto';

export interface CompanyLogoData {
  image: Buffer;
  mimeType: string;
}

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
        invoiceMailCustomMessage: data.invoiceMailCustomMessage ?? null,
        legalStatus: data.legalStatus,
        vatRateBasisPoints: data.vatRateBasisPoints,
        invoiceNumberPrefix: data.invoiceNumberPrefix,
        declarationFrequency: data.declarationFrequency,
        microEntrepreneurCeiling: data.microEntrepreneurCeiling ?? null,
        defaultDepositPercentageBasisPoints: data.defaultDepositPercentageBasisPoints ?? null,
        cotisationVenteBasisPoints: data.cotisationVenteBasisPoints,
        cotisationPrestationBicBasisPoints: data.cotisationPrestationBicBasisPoints,
        cotisationPrestationBncBasisPoints: data.cotisationPrestationBncBasisPoints,
        versementLiberatoireOptIn: data.versementLiberatoireOptIn,
        decennialInsuranceApplicable: data.decennialInsuranceApplicable,
        decennialInsurerName: data.decennialInsuranceApplicable ? data.decennialInsurerName : null,
        decennialInsurancePolicyNumber: data.decennialInsuranceApplicable
          ? data.decennialInsurancePolicyNumber
          : null,
        decennialInsuranceCoverageArea: data.decennialInsuranceApplicable
          ? data.decennialInsuranceCoverageArea
          : null,
        customFooterMessage: data.customFooterMessage ?? null,
        customFooterOnFacture: data.customFooterOnFacture,
        customFooterOnDevis: data.customFooterOnDevis,
        earlyPaymentDiscountMention: data.earlyPaymentDiscountMention ?? null,
        vatOnDebitsOption: data.vatOnDebitsOption,
      },
    });
  }

  // Kept out of findById/the Company row itself — see schema.prisma's
  // comment on Company.logo for why this is its own table/query, only ever
  // read where a logo is actually needed (PDF generation, GET /company/logo,
  // the settings page's hasLogo flag), never pulled in by the ordinary
  // Company/Invoice reads that `include: { company: true }` all over the app.
  hasLogo(companyId: string): Promise<boolean> {
    return this.prisma.companyLogo
      .findUnique({ where: { companyId }, select: { companyId: true } })
      .then((row) => row !== null);
  }

  async findLogo(companyId: string): Promise<CompanyLogoData | null> {
    const row = await this.prisma.companyLogo.findUnique({
      where: { companyId },
      select: { image: true, mimeType: true },
    });
    // Prisma 7's Bytes maps to Uint8Array, not Node's Buffer — Buffer.from
    // wraps it without copying, giving callers the richer Buffer API
    // (.toString('base64'), used by InvoiceMapper.issuerFields) for free.
    return row ? { image: Buffer.from(row.image), mimeType: row.mimeType } : null;
  }

  // Upsert: an artisan replacing an existing logo overwrites it in place
  // rather than accumulating rows — this table is 1:1 with Company by
  // design (@id companyId), so there is only ever one to replace.
  upsertLogo(companyId: string, data: CompanyLogoData): Promise<void> {
    // Buffer IS a Uint8Array at runtime — the cast below only works around
    // Prisma 7's generated type being pinned to Uint8Array<ArrayBuffer>
    // specifically (excluding Buffer's wider ArrayBufferLike), never an
    // actual representation mismatch.
    const image = data.image as unknown as Uint8Array<ArrayBuffer>;
    return this.prisma.companyLogo
      .upsert({
        where: { companyId },
        create: { companyId, image, mimeType: data.mimeType },
        update: { image, mimeType: data.mimeType },
      })
      .then(() => undefined);
  }

  // No-op (not an error) when no logo was ever uploaded — "remove a logo
  // that isn't there" is a safe, idempotent action from the artisan's side.
  async deleteLogo(companyId: string): Promise<void> {
    await this.prisma.companyLogo.deleteMany({ where: { companyId } });
  }
}
