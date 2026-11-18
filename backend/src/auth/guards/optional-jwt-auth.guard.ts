import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// For @Public() routes that still want to know who's calling *if* they can:
// the global JwtAuthGuard short-circuits on @Public() without ever running
// passport, so req.user stays unset there. Applied per-route with
// @UseGuards (runs after the global chain), this runs the same 'jwt'
// strategy but never rejects — a missing/expired/invalid access cookie just
// leaves req.user undefined instead of a 401.
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_error: unknown, user: TUser | false): TUser | undefined {
    return user || undefined;
  }
}
