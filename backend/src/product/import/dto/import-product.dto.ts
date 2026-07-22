import { IsUrl, MaxLength } from 'class-validator';

export class ImportProductDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url: string;
}
