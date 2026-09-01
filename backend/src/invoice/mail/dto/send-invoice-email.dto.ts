import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

// All fields optional/overridable: `to` defaults to the invoice's own
// customerEmail, `subject`/`message` default to buildDefaultInvoiceMailTemplate
// — the roadmap's "default template... editable before sending" and
// "recipient prefilled... editable per send" requirements, both expressed as
// "send what you typed, or fall back if you typed nothing".
export class SendInvoiceEmailDto {
  @IsOptional()
  @IsEmail()
  to?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message?: string;

  // Which file the artisan clicked "Partager" ('pdf') or "Partager en
  // Factur-X" ('facturx') for before the three-tier share fallback landed
  // on this SMTP tier — see InvoiceShareService. When set, overrides
  // Company.autoAttachFacturX for this send so the email actually attaches
  // the file the artisan asked for; omitted falls back to that company-wide
  // default (InvoiceMailService.send).
  @IsOptional()
  @IsIn(['pdf', 'facturx'])
  format?: 'pdf' | 'facturx';
}
