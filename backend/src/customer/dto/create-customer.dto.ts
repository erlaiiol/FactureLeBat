import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  // French SIRET: exactly 14 digits, optional since not every customer is a
  // registered business.
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'siret must be exactly 14 digits' })
  siret?: string;

  // Phase 14.5: freehand, optional — feeds customer search alongside name/
  // companyName/address (see CustomerRepository.findAll).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
