import { plainToInstance } from 'class-transformer';
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

// One class, one job: describe every env var the app reads and its
// constraints, so a misconfigured deployment fails fast at boot with a
// readable error instead of crashing (or silently misbehaving) later on
// the first request that touches the missing/malformed value.
class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

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
  @IsInt()
  @Min(1)
  @IsOptional()
  SOURCING_DAILY_SEARCH_CAP = 20;
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
