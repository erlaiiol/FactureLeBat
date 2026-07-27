import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

  // Phase 13 auth. Unlike GROQ_API_KEY/APP_ENCRYPTION_KEY, this is NOT
  // optional: auth is core to the app now (every route needs a valid
  // access-token JWT unless @Public()), so an unset secret fails boot
  // fast, same posture as DATABASE_URL — there is no reduced-functionality
  // mode for "no auth secret configured".
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_EXPIRES_IN = '15m';

  // Refresh-token lifetime when the artisan checked "rester connecté" at
  // login (the default) vs. left it unchecked — see auth/auth.service.ts.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN_DAYS = 30;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_REFRESH_NOT_REMEMBERED_EXPIRES_IN_DAYS = 1;

  // Phase 13 Google OAuth. Optional as a pair, same "boots fine without it"
  // posture as GROQ_API_KEY: AuthModule only registers GoogleStrategy (and
  // GET /auth/google*) when both id and secret are set.
  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL = 'http://localhost:3000/api/auth/google/callback';

  // Where /auth/google/callback and email-verification/password-reset links
  // send the browser once the backend is done — the frontend's own origin.
  @IsOptional()
  @IsString()
  FRONTEND_URL = 'http://localhost:4200';

  // Phase 13 transactional email (account verification, password reset) —
  // deliberately a separate credential set from Phase 12's mail-settings,
  // which sends invoices from the *artisan's own* address to *their*
  // clients. This is the app's own system mailbox. Optional like
  // GROQ_API_KEY: unset means AuthService logs a warning and the
  // verification/reset routes reply 503, everything else still works.
  @IsOptional()
  @IsString()
  SYSTEM_SMTP_HOST?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SYSTEM_SMTP_PORT = 587;

  // Plain @Type(() => Boolean) would coerce any non-empty string (including
  // the literal text "false") to true — env vars only ever arrive as raw
  // strings, so this needs an explicit string->boolean transform instead.
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  SYSTEM_SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SYSTEM_SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SYSTEM_SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SYSTEM_MAIL_FROM_NAME = 'FactureLe';

  @IsOptional()
  @IsString()
  SYSTEM_MAIL_FROM_ADDRESS?: string;

  // Phase 14 Stripe subscription billing. Optional as a trio, same "boots
  // fine without it" posture as GROQ_API_KEY/APP_ENCRYPTION_KEY: the app
  // starts with no Stripe key set, BillingService just reports the feature
  // unavailable (503) on checkout/portal/webhook routes until all three are
  // configured. STRIPE_PRICE_ID is the recurring 15€/month Price id created
  // in the Stripe dashboard/CLI — never hardcoded, since it differs between
  // test and live mode.
  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsOptional()
  @IsString()
  STRIPE_PRICE_ID?: string;

  // Phase 22 push notifications (FCM, both iOS and Android — see
  // push-notification/push-sender.service.ts for why iOS goes through FCM
  // too rather than a separate direct-APNs credential set). Base64-encoded
  // Firebase service-account JSON. Optional like GROQ_API_KEY: the app
  // boots fine without it, PushSenderService just reports the feature
  // unavailable (503) until it's set.
  // Generate one with: base64 -i service-account.json | tr -d '\n'
  @IsOptional()
  @IsString()
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;

  // Phase 14 admin bootstrap: on every boot, AdminSeedService promotes the
  // User with this email (if one exists) to ADMIN — see
  // admin/admin-seed.service.ts. Deliberately not a self-service signup
  // flow: the only way in is an env var only whoever controls the
  // deployment can set, and it's idempotent (re-running it on an
  // already-ADMIN user is a no-op), so it's safe to leave configured
  // indefinitely rather than a one-shot script.
  @IsOptional()
  @IsString()
  ADMIN_SEED_EMAIL?: string;

  // `make demo` (see Makefile, infra/demo-seed.sh) — gates the one-click
  // demo-login endpoints (auth/guards/demo-mode-enabled.guard.ts) so a real
  // deployment, where this is never set, can never log in as one of the
  // fixed demo accounts (auth/demo.constants.ts). Same string->boolean
  // transform as SYSTEM_SMTP_SECURE above: env vars only ever arrive as raw
  // strings.
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  DEMO_MODE = false;
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
