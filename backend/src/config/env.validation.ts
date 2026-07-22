import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

// Mirrors LOG_LEVELS in src/logging/winston.config.ts — kept as a separate
// literal here (rather than importing it) since validateEnv runs before any
// other module in the app is safe to assume fully resolved.
enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Http = 'http',
  Debug = 'debug',
}

// One class, one job: describe every env var the app reads and its
// constraints, so a misconfigured deployment fails fast at boot with a
// readable error instead of crashing (or silently misbehaving) later on
// the first request that touches the missing/malformed value.
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // @Type is required, not just enableImplicitConversion below: this class is
  // validated at AppModule's module-evaluation time (ConfigModule.forRoot's
  // argument), before main.ts's own imports necessarily finish resolving —
  // relying on reflected design:type metadata for the string->number
  // conversion is timing-fragile, and silently leaves PORT as the raw env
  // string, which then fails @IsInt(). An explicit @Type always converts
  // regardless of import order — this is what broke `docker compose up` on
  // the prod image, which sets PORT via a real env var (docker-compose.prod.yml).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsUrl({ protocols: ['postgresql', 'postgres'], require_tld: false })
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  // Defaults to 'debug' in development and 'info' in production — see
  // buildWinstonOptions(). Set explicitly to turn on Prisma query logging
  // (only emitted below 'info') on a prod instance while debugging, without
  // a redeploy that changes NODE_ENV.
  @IsEnum(LogLevel)
  @IsOptional()
  LOG_LEVEL?: LogLevel;

  // Phase 10 sourcing assistant. Deliberately optional: an artisan can run
  // the whole app with this unset, SourcingService just reports the feature
  // as unavailable instead of the app refusing to boot (see conventions.md's
  // "no auth yet, no forced third-party dependency" posture).
  @IsOptional()
  @IsString()
  GROQ_API_KEY?: string;

  // Global (single-company) cap on real Groq calls per day, across both
  // supplier search and complementary suggestions — bounds cost on an
  // account with no per-user billing yet (pre-Phase-13/14). Cache hits never
  // count against it (see SourcingRepository).
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  SOURCING_DAILY_SEARCH_CAP = 20;

  // Phase 12 invoice mailing: base64-encoded 32-byte key (AES-256-GCM),
  // used to encrypt the artisan's SMTP app password at rest. Optional like
  // GROQ_API_KEY above — the app boots fine without it, MailSettingsService
  // just reports mail configuration as unavailable (503) until it's set.
  // Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  @IsOptional()
  @IsString()
  APP_ENCRYPTION_KEY?: string;
}

// Wired into ConfigModule.forRoot({ validate }) in AppModule — runs once at
// bootstrap, before any HTTP traffic is accepted.
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables:\n${errors.toString()}`);
  }

  return validated;
}
