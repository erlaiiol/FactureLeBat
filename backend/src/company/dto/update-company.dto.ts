import {
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
} from 'class-validator';
import { LegalStatus } from '../../../generated/prisma/enums';

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
}
