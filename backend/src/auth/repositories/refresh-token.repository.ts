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
