import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleTokenLoginDto {
  // The Google-signed ID token from the native Credential Manager sign-in
  // (see frontend's GoogleNativeLoginService) — verified server-side in
  // AuthService.googleTokenLogin, never trusted as-is.
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
