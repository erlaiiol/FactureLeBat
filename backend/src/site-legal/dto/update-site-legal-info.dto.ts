import { IsOptional, IsString, MaxLength } from 'class-validator';

// Full-replace, same convention as UpdateCompanyDto — every field is still
// optional (not Validators.required-style) because the admin fills this in
// incrementally (SIRET known before the hosting provider is chosen, etc.),
// and an empty string is a legitimate "not filled in yet" value here, not
// an error.
export class UpdateSiteLegalInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  publisherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  siret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  directorOfPublication?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hostingProviderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  hostingProviderAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string;
}
