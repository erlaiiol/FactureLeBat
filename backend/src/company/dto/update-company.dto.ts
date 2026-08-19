import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { DeclarationFrequency, LegalStatus } from '../../../generated/prisma/enums';

// Same generous-but-finite bound as CreateProductDto/CreateServiceDto's
// MAX_PRICE_CENTS — rejects an obviously-wrong input, not a real limit.
const MAX_CEILING_CENTS = 100_000_000; // 1,000,000.00 €

export class UpdateCompanyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  // French SIRET: exactly 14 digits.
  @Matches(/^\d{14}$/, { message: 'siret must be exactly 14 digits' })
  siret: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  postalCode: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // Appended to the default invoice/devis message on every send (native
  // share, SMTP compose modal, mailto fallback) — see
  // buildDefaultInvoiceMailTemplate.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  invoiceMailCustomMessage?: string;

  @IsEnum(LegalStatus)
  legalStatus: LegalStatus;

  // Basis points: 2000 = 20.00%. Capped at 10000 (100%) — anything above is
  // certainly a unit-conversion mistake on the client, not a real VAT rate.
  @IsInt()
  @Min(0)
  @Max(10000)
  vatRateBasisPoints: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  invoiceNumberPrefix?: string;

  // Phase 17: which period the quarterly report screen preselects — the
  // report itself always accepts an explicit from/to range regardless.
  @IsOptional()
  @IsEnum(DeclarationFrequency)
  declarationFrequency?: DeclarationFrequency;

  // Phase 17: cents. Deliberately not validated against any real URSSAF
  // figure — the artisan sets whatever their own actual plafond is; a wrong
  // number here only affects a warning banner, never a computed total.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_CEILING_CENTS)
  microEntrepreneurCeiling?: number;

  // Phase 1.1-3: the artisan's habitual acompte rate, basis points (3000 =
  // 30.00%) — same convention/bound as vatRateBasisPoints. Null (omitted)
  // means no default — see schema.prisma's comment on
  // Company.defaultDepositPercentageBasisPoints.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  defaultDepositPercentageBasisPoints?: number;

  // Phase 17 (charges estimate): micro-entrepreneur "cotisations sociales"
  // rates, basis points (1230 = 12.30%) — see schema.prisma's comment on
  // Company.cotisationVenteBasisPoints. Capped at 10000 (100%) for the same
  // "obviously a mistake, not a real rate" reason as vatRateBasisPoints.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  cotisationVenteBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  cotisationPrestationBicBasisPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  cotisationPrestationBncBasisPoints?: number;

  @IsOptional()
  @IsBoolean()
  versementLiberatoireOptIn?: boolean;

  // BTP mandatory mention (art. L243-2 du Code des assurances): the artisan
  // declares themself subject to garantie décennale, which makes the three
  // fields below required — never inferred from legalStatus/siret, there's
  // no way to derive "does construction work" from either.
  @IsBoolean()
  decennialInsuranceApplicable: boolean;

  @ValidateIf((dto: UpdateCompanyDto) => dto.decennialInsuranceApplicable)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  decennialInsurerName?: string;

  @ValidateIf((dto: UpdateCompanyDto) => dto.decennialInsuranceApplicable)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  decennialInsurancePolicyNumber?: string;

  @ValidateIf((dto: UpdateCompanyDto) => dto.decennialInsuranceApplicable)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  decennialInsuranceCoverageArea?: string;
}
