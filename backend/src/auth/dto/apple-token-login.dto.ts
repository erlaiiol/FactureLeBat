import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AppleTokenLoginDto {
  // The Apple-signed identity token from the native ASAuthorizationController
  // flow (see frontend's AppleNativeLoginService) — verified server-side in
  // AuthService.appleTokenLogin, never trusted as-is.
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  // The one-time authorization code from the same native response, present
  // on every login (unlike name/email, which Apple only ever includes on
  // the very first authorization). Optional here only because a deployment
  // without APPLE_TEAM_ID/APPLE_KEY_ID configured has no use for it — see
  // AuthService.appleTokenLogin's best-effort refresh-token capture.
  @IsOptional()
  @IsString()
  authorizationCode?: string;

  // Defaults to 'ios' (this route's original, only caller) when omitted —
  // 'android' is the browser+deep-link bridge flow (see
  // DeepLinkService/AuthController.appleMobileCallback), whose identityToken
  // has `aud` = APPLE_SERVICES_ID rather than the native bundle ID, so
  // AuthService.appleTokenLogin needs to know which audience to check.
  @IsOptional()
  @IsIn(['ios', 'android'])
  platform?: 'ios' | 'android';
}
