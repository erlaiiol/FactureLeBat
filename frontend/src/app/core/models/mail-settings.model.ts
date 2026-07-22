// The password is write-only: never returned by GET, always re-sent in full
// on every PATCH (see backend's UpdateMailSettingsDto for why there's no
// "leave unchanged" option).
export interface MailSettings {
  host: string | null;
  port: number | null;
  secure: boolean;
  user: string | null;
  configured: boolean;
}

export interface UpdateMailSettingsRequest {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
}
