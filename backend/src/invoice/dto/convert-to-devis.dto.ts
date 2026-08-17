import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

// The artisan's chosen devis number for InvoiceService.convertToDevis —
// mandatory here (unlike CreateInvoiceDto.number), since retroactively
// creating a devis has no "next one in this company's sequence" default
// that wouldn't risk silently misrepresenting when it was actually issued.
// The frontend pre-fills the same suggestion InvoiceService.getNextNumber
// already offers everywhere else and lets the artisan edit it before
// confirming. Same charset restriction as CreateInvoiceDto.number — see
// there for why (interpolated unescaped into filenames downstream).
export class ConvertToDevisDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[\p{L}\p{N} _.-]+$/u, {
    message:
      'Le numéro ne peut contenir que des lettres, chiffres, espaces, points, tirets et underscores.',
  })
  number!: string;
}
