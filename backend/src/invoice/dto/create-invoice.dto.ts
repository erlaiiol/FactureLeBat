import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { CreateInvoiceServiceLineDto } from './create-invoice-service-line.dto';
import { ServiceLineWeightsMatchLines } from './service-line-weights-match-lines.validator';

// No real invoice needs more lines than this — capping it bounds the cost of
// PDF rendering and the calculation loop per request.
const MAX_LINES = 200;
// Same reasoning, applied to Phase 5 service lines.
const MAX_SERVICE_LINES = 50;

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

  // Phase 5: services added to the invoice, each either its own visible
  // amount or hidden and redistributed into the lines above (see
  // CreateInvoiceServiceLineDto). Optional and defaults to none — most
  // invoices are still just product lines.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SERVICE_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceServiceLineDto)
  @ServiceLineWeightsMatchLines()
  serviceLines?: CreateInvoiceServiceLineDto[];
}
