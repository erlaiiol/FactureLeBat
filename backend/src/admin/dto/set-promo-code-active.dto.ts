import { IsBoolean } from 'class-validator';

export class SetPromoCodeActiveDto {
  @IsBoolean()
  active: boolean;
}
