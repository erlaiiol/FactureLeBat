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

  // Phase 1.2-2 (2026 e-invoicing reform): FR + 2-character key + 9-digit
  // SIREN. Validated, not freehand, same reasoning as customerSiret
  // (Phase 1.1-8) — a malformed VAT ID would make the Factur-X file this
  // reform requires fail PA-side validation, not just look wrong on screen.
  // Optional: a franchise-en-base artisan has no VAT number at all.
  @IsOptional()
  @Matches(/^FR[0-9A-Z]{2}\d{9}$/, {
    message: 'vatNumber must be FR followed by a 2-character key and the 9-digit SIREN',
  })
  vatNumber?: string;

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

  // Phase 1.1-6: free-text footer mention, no format imposed — same bound
  // as invoiceMailCustomMessage. The two toggles are independent booleans,
  // not gated on the message being filled in (a company can enable a
  // toggle before writing the message, same as decennialInsurance's own
  // toggle-then-details ordering).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  customFooterMessage?: string;

  @IsBoolean()
  customFooterOnFacture: boolean;

  @IsBoolean()
  customFooterOnDevis: boolean;

  // Phase 1.1-7: Art. L441-9's escompte-policy mention — see schema.prisma's
  // comment on Company.earlyPaymentDiscountMention for why this has a DB
  // default rather than being pre-filled here. Optional at the DTO level
  // purely so the field can be cleared back to null like every other
  // optional company text field; in practice the frontend always sends
  // whatever text is currently in the field, pre-filled or artisan-edited.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  earlyPaymentDiscountMention?: string;

  // Phase 1.1-8 (2026 e-invoicing reform): "option pour le paiement de la
  // taxe d'après les débits" — same toggle-prints-a-fixed-mention pattern
  // as customFooterOnFacture above.
  @IsBoolean()
  vatOnDebitsOption: boolean;

  // Phase 1.3-1 (2026 e-invoicing reform, workflow automation): see
  // schema.prisma's comment on Company.autoAttachFacturX and friends.
  // Required like vatOnDebitsOption above (the frontend form always sends a
  // value), not optional — autoTransmitViaPa/autoSyncReceivedInvoices are
  // additionally enforced server-side in CompanyService (can't be turned on
  // without SUPER PDP connected), not just validated for shape here.
  @IsBoolean()
  autoAttachFacturX: boolean;

  @IsBoolean()
  autoTransmitViaPa: boolean;

  @IsBoolean()
  autoSyncReceivedInvoices: boolean;
}
