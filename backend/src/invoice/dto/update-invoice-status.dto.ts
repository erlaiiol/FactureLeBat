import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { InvoiceStatus } from '../../../generated/prisma/enums';

// Phase 16: drives both the board's drag/button status changes and a
// due-date-only edit from an existing card (send the unchanged status +
// a new dueDate) — one endpoint covers both, see InvoiceService.updateStatus.
// EN_RETARD is never a valid value here: it's computed, not settable — see
// InvoiceStatus (schema.prisma).
export class UpdateInvoiceStatusDto {
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
