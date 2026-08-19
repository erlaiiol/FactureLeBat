import { IsBoolean } from 'class-validator';

// The freehand fallback checkbox — see schema.prisma's comment on
// Invoice.manuallySigned. InvoiceService.setManuallySigned rejects this
// when a real InvoiceSignature is already attached.
export class UpdateManuallySignedDto {
  @IsBoolean()
  manuallySigned: boolean;
}
