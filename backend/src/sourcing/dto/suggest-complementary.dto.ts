import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Unit } from '../../../generated/prisma/enums';

// No search involved (Phase 10: "a plain, non-search model call") — only
// enough context to ground suggestions in the right trade/category.
export class SuggestComplementaryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  productName: string;

  @IsOptional()
  @IsEnum(Unit)
  unit?: Unit;
}
