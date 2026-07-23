import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { XSRF_COOKIE, XSRF_HEADER } from '../auth.constants';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Double-submit cookie CSRF defense. A non-httpOnly XSRF-TOKEN cookie is
// (re)issued on every login/register/refresh/Google-callback (see
// AuthService.issueTokens + cookie.util.ts), and Angular's HttpClient reads
// it back into an X-XSRF-TOKEN header automatically on every mutating
// request (withXsrfConfiguration in app.config.ts). A cross-site attacker
// can make the victim's browser SEND the cookie but can never READ it to
// copy its value into the header, so a mismatch (or absence) means the
// request didn't originate from our own frontend code.
//
// Only applies to authenticated (non-@Public), state-changing requests —
// register/login/refresh are the entry points that establish the cookie in
// the first place and have no existing session to forge a request against
// yet.
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const cookies = request.cookies as Record<string, string> | undefined;
    const cookieValue = cookies?.[XSRF_COOKIE];
    const headerValue = request.get(XSRF_HEADER);
    if (!cookieValue || !headerValue || cookieValue !== headerValue) {
      throw new ForbiddenException('Jeton CSRF invalide ou manquant.');
    }
    return true;
  }
}
