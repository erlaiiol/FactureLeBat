import { IsString, MaxLength, MinLength } from 'class-validator';

// A freehand extra client field (e.g. label "SIRET", value "123 456 789
// 00012") — no fixed vocabulary, the artisan names the field themselves.
// See InvoiceCustomerField (schema.prisma).
export class CreateInvoiceCustomerFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  value: string;
}
