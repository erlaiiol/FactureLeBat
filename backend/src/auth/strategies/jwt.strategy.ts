import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ACCESS_TOKEN_COOKIE } from '../auth.constants';

interface AccessTokenPayload {
  sub: string;
  companyId: string;
  role: AuthenticatedUser['role'];
  email: string;
  emailVerified: boolean;
}

// The access token lives in an httpOnly cookie, never an Authorization
// header (see docs/roadmap.md Phase 13's httpOnly-cookie decision) — this
// is the one place that reads it back out for passport-jwt to verify.
function extractFromCookie(req: Request): string | null {
  const cookies = req.cookies as Record<string, string> | undefined;
  return cookies?.[ACCESS_TOKEN_COOKIE] ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: extractFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      companyId: payload.companyId,
      role: payload.role,
      email: payload.email,
      emailVerified: payload.emailVerified,
    };
  }
}
