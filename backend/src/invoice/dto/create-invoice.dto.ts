import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';

// No real invoice needs more lines than this — capping it bounds the cost of
// PDF rendering and the calculation loop per request.
const MAX_LINES = 200;

export class CreateInvoiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  customerName: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  customerAddress?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  customerEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  // Soft reference to a saved Customer this invoice was based on, if the
  // artisan picked one — purely a link, never authoritative over the
  // customer fields above (see InvoiceService.create).
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines: CreateInvoiceLineDto[];
}
