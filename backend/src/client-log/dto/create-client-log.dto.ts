import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const CLIENT_LOG_KINDS = ['http_error', 'session_check'] as const;
export type ClientLogKind = (typeof CLIENT_LOG_KINDS)[number];

export const CLIENT_PLATFORMS = ['ios', 'android', 'web'] as const;

export class ClientLogEventDto {
  @IsIn(CLIENT_LOG_KINDS)
  kind!: ClientLogKind;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  method?: string;

  // Path only — the frontend strips the query string before sending, and
  // never sends a body (see client-log.service.ts on the frontend).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  url?: string;

  // 0 = the request never got an HTTP response at all (offline, DNS, CORS,
  // TLS, client-side timeout) — the case the server can't log by itself.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  status?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  // Server-issued x-request-id of the failed call, when it got that far —
  // lets the operator jump from this line to the server's own log of it.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  requestId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600_000)
  durationMs?: number;

  @IsISO8601()
  at!: string;
}

export class CreateClientLogDto {
  @IsIn(CLIENT_PLATFORMS)
  platform!: (typeof CLIENT_PLATFORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ClientLogEventDto)
  events!: ClientLogEventDto[];
}
