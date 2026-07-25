import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class GrantPremiumDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  days: number;
}
