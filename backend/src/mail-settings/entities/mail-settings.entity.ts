// The password itself never appears in a response, whether encrypted or
// not — `configured` is the only thing the frontend needs to know ("is
// there already a working SMTP account on file").
export interface MailSettings {
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  configured: boolean;
}

// Internal shape only — used by MailerService/InvoiceMailService to actually
// connect, never returned from a controller.
export interface SmtpCredentials {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}
