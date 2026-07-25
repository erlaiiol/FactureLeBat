import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../database/prisma.service';

// Runs once at boot (OnModuleInit — after Nest's DI container, and
// therefore PrismaService's DB connection, is ready). Promotes the User
// with ADMIN_SEED_EMAIL (if one exists) to ADMIN — see docs/roadmap.md
// Phase 14: deliberately not a self-service "become admin" flow, the only
// way in is an env var only whoever controls the deployment can set.
// Idempotent (updateMany matches zero or one row every time), so it's safe
// to leave ADMIN_SEED_EMAIL configured indefinitely across every restart
// rather than needing to unset it after first use.
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_SEED_EMAIL');
    if (!email) {
      return;
    }
    const { count } = await this.prisma.user.updateMany({
      where: { email, role: { not: UserRole.ADMIN } },
      data: { role: UserRole.ADMIN },
    });
    if (count > 0) {
      this.logger.log(`Promoted ${email} to ADMIN (ADMIN_SEED_EMAIL)`);
    }
  }
}
