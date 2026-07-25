import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RefreshTokenModel as RefreshToken } from '../../../generated/prisma/models';

@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    remembered: boolean,
  ): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt, remembered } });
  }

  findByHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  revoke(id: string): Promise<RefreshToken> {
    return this.prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  // Conditional revoke that stamps the replacement pointer in the same
  // write — deliberately one statement, not revoke-then-update, so no
  // request can ever observe this row as "revoked" without its
  // replacedByTokenHash already set (see AuthService.rotateFrom/handleReuse
  // and the module doc on replacedByTokenHash). Only succeeds (count 1) if
  // the row was still active at the moment of the write; a caller that
  // loses this compare-and-swap already has its own freshly-issued tokens
  // regardless, so it doesn't need to inspect the count.
  async revokeIfActiveWithReplacement(id: string, replacedByTokenHash: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedByTokenHash },
    });
    return result.count;
  }

  // Used both on password reset (standard post-reset hygiene) and on
  // refresh-token reuse detection (a revoked token presented again is
  // treated as a stolen/leaked token — see AuthService.refresh).
  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
