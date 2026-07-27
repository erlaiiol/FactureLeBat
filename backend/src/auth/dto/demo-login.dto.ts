import { IsString, MaxLength, MinLength } from 'class-validator';

export class DemoLoginDto {
  // One of DEMO_PROFILES's `key`s (auth/demo.constants.ts) — validated
  // against the actual list in AuthService.demoLogin, not by an @IsIn here,
  // so the list only has to be kept in one place.
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  key: string;
}
