import { IsString, Length } from 'class-validator';

export class RedeemPromoCodeDto {
  @IsString()
  @Length(4, 32)
  code: string;
}
