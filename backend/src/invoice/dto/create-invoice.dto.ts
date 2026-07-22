import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InvoiceEntryMode } from '../../../generated/prisma/enums';
import { CreateInvoiceCustomerFieldDto } from './create-invoice-customer-field.dto';
import { CreateInvoiceLineDto } from './create-invoice-line.dto';
import { CreateInvoiceServiceLineDto } from './create-invoice-service-line.dto';
import { CreateManualTableDto } from './manual/create-manual-table.dto';
import { ManualModeFieldsConsistency } from './manual-mode-fields-consistency.validator';
import { ServiceLineWeightsMatchLines } from './service-line-weights-match-lines.validator';

// No real invoice needs more lines than this — capping it bounds the cost of
// PDF rendering and the calculation loop per request.
const MAX_LINES = 200;
// Same reasoning, applied to Phase 5 service lines.
const MAX_SERVICE_LINES = 50;
// Same reasoning, applied to freehand extra client fields.
const MAX_CUSTOMER_FIELDS = 20;
// Same generous-but-finite bound as a manual-table cell value (see
// manual-cell-parser.util's MAX_CELL_VALUE, in euros) — reject an
// obviously-wrong override, not model a real business limit.
const MAX_OVERRIDE_CENTS = 100_000_000;

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

  // Freehand, artisan-named extra client fields (e.g. "SIRET") — no fixed
  // vocabulary, see CreateInvoiceCustomerFieldDto/InvoiceCustomerField.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_CUSTOMER_FIELDS)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceCustomerFieldDto)
  customerFields?: CreateInvoiceCustomerFieldDto[];

  // Soft reference to a saved Customer this invoice was based on, if the
  // artisan picked one — purely a link, never authoritative over the
  // customer fields above (see InvoiceService.create).
  @IsOptional()
  @IsUUID()
  customerId?: string;

  // Phase 9.5: which input surface authored this invoice — see
  // InvoiceEntryMode (schema.prisma). Defaults to GUIDED (today's
  // catalog/form-driven flow) so every pre-Phase-9.5 client keeps working
  // unchanged. ManualModeFieldsConsistency enforces that exactly the fields
  // matching this mode are present below.
  @IsOptional()
  @IsEnum(InvoiceEntryMode)
  @ManualModeFieldsConsistency()
  entryMode?: InvoiceEntryMode = InvoiceEntryMode.GUIDED;

  // Required (non-empty) only for entryMode GUIDED — a bare @ArrayMinSize(1)
  // would wrongly reject a legitimate MANUAL invoice, which has none. See
  // ManualModeFieldsConsistency for the actual cross-field requirement.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines?: CreateInvoiceLineDto[];

  // Phase 5: services added to the invoice, each either its own visible
  // amount or hidden and redistributed into the lines above (see
  // CreateInvoiceServiceLineDto). Optional and defaults to none — most
  // invoices are still just product lines. Forbidden for entryMode MANUAL
  // (see ManualModeFieldsConsistency) — manual mode has no separate service
  // concept, an artisan just adds another row.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SERVICE_LINES)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceServiceLineDto)
  @ServiceLineWeightsMatchLines()
  serviceLines?: CreateInvoiceServiceLineDto[];

  // Phase 9.5 manual mode's whole body — required exactly when entryMode is
  // MANUAL, forbidden otherwise (see ManualModeFieldsConsistency).
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateManualTableDto)
  manualTable?: CreateManualTableDto;

  // Phase 9.5 bis: manual mode's own aggregate figures, freely overridable —
  // same "nothing computed behind the artisan's back" principle as a row's
  // LINE_TOTAL cell, extended up to the whole invoice. Forbidden for
  // entryMode GUIDED (see ManualModeFieldsConsistency), where these three
  // stay purely derived from the lines/services, never persisted.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_OVERRIDE_CENTS)
  subtotalOverrideCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_OVERRIDE_CENTS)
  vatOverrideCents?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_OVERRIDE_CENTS)
  totalOverrideCents?: number;
}
