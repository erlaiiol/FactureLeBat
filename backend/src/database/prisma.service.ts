import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

// `extends PrismaClient` alone defaults its LogOpts generic to `never`
// (Prisma only infers it from a direct `new PrismaClient(options)` call —
// its constructor's own generic signature, keyed off `Options`, isn't the
// same one the `extends` clause resolves to), which would make every
// `$on()` below a type error. `PrismaEventClient` re-opens the *type*
// (not the constructor) with the three events onModuleInit actually wires
// up, so casting `this` to it below is what makes `$on()` type-check.
type PrismaEventClient = PrismaClient<'error' | 'warn' | 'query'>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    // `configService` (a constructor parameter, not `this.configService`) is
    // usable here: parameters are bound before `super()` runs, only `this`
    // isn't available yet.
    const isProduction = configService.get<string>('NODE_ENV') === 'production';
    super({
      adapter: new PrismaPg({ connectionString: configService.getOrThrow<string>('DATABASE_URL') }),
      // 'query' is opt-in to development only: it logs every statement
      // (with parameter values) at debug volume, which is invaluable while
      // building a feature but both noisy and a data-exposure risk to leave
      // on by default against a production database.
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        ...(isProduction ? [] : [{ emit: 'event' as const, level: 'query' as const }]),
      ],
    });
  }

  async onModuleInit() {
    const events = this as unknown as PrismaEventClient;
    events.$on('error', (event) =>
      this.logger.error({ message: event.message, target: event.target }),
    );
    events.$on('warn', (event) =>
      this.logger.warn({ message: event.message, target: event.target }),
    );
    events.$on('query', (event) =>
      this.logger.debug({ message: `${event.query} -- ${event.duration}ms`, params: event.params }),
    );

    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
