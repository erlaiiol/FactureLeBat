import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthTokenModel as AuthToken } from '../../../generated/prisma/models';
import { AuthTokenPurpose } from '../../../generated/prisma/enums';

// One table, two kinds (email verification, password reset) — see
// AuthTokenPurpose in schema.prisma. Identical create/hash/expire/consume
// plumbing for both, so this repository stays purpose-agnostic; AuthService
// is the only place that cares which purpose a given call is for.
@Injectable()
export class AuthTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    purpose: AuthTokenPurpose,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<AuthToken> {
    return this.prisma.authToken.create({ data: { userId, purpose, tokenHash, expiresAt } });
  }

  findByHash(tokenHash: string): Promise<AuthToken | null> {
    return this.prisma.authToken.findUnique({ where: { tokenHash } });
  }

  consume(id: string): Promise<AuthToken> {
    return this.prisma.authToken.update({ where: { id }, data: { consumedAt: new Date() } });
  }
}
