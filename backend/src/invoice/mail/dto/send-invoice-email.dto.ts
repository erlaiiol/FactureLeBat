import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

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
}
