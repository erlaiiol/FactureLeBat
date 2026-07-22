# Logging

The backend logs through [Winston](https://github.com/winstonjs/winston) (`nest-winston` wires it into Nest's own `Logger`), not raw `console.log`. Every `new Logger(X.name)` call already in the codebase (`PrismaService`, `MailerService`, `SafeFetcherService`, `ProductImportService`, `GroqClientService`) gets this for free — nothing about how those files call `Logger` changed, only what's underneath it. See `backend/src/logging/` for the implementation; this doc is the "how to read it" companion.

## What gets logged automatically

- **Every HTTP request**: one line per request (`backend/src/logging/http-logging.middleware.ts`), written when the response finishes — method, path, status code, duration, caller IP. Level follows the status: `2xx`/`3xx` → `http`, `4xx` → `warn`, `5xx` → `error`.
- **Every uncaught exception**: `backend/src/common/filters/all-exceptions.filter.ts` is registered as the single global exception filter (`app.useGlobalFilters`) — nothing thrown anywhere in the app (a deliberate `NotFoundException`, a Prisma error that slipped through, a raw bug) reaches the client or disappears without a log line first. A `4xx` logs a one-line summary at `warn`; a `5xx` logs at `error` with the full stack trace. The JSON error body sent to the client is unchanged from Nest's own default shape (`statusCode`/`message`/`error`) plus three additive fields: `path`, `timestamp`, `requestId` — nothing already parsing `error.error.message` on the frontend is affected.
- **Prisma**: connection lifecycle, and `error`/`warn` events always; **`query` events only outside production** (`NODE_ENV !== 'production'`) — every SQL statement, its parameters, and duration, at `debug`. Off by default in prod: it's both noisy and a data-exposure risk to log real customer/invoice data at that volume against a live database.
- **Process-level crashes**: `uncaughtException`/`unhandledRejection` are caught in `main.ts` and logged at `error` with the full stack before the process exits — a crash during boot (bad `DATABASE_URL`, a failed Prisma adapter) is visible in the logs instead of an unstructured stderr dump.

## Levels and colors

| Level   | Color   | Used for |
|---------|---------|----------|
| `error` | red     | 5xx responses, uncaught exceptions, process crashes, Prisma errors |
| `warn`  | yellow  | 4xx responses, Prisma warnings |
| `info`  | green   | Nest lifecycle (module init, route mapping), `PrismaService`'s "Connected to PostgreSQL" |
| `http`  | magenta | routine request logging (2xx/3xx) |
| `debug` | gray    | Prisma query logging (dev only) |

The whole line is colored (not just the level tag), specifically so a scroll through `tail -f`/`docker compose logs` or a `grep ERROR` on the raw file makes the severity obvious at a glance without reading the text. Colors render identically whether you're looking at the console (`docker compose logs`) or the log files on disk — see below.

`LOG_LEVEL` (env var, optional) sets the minimum level emitted: defaults to `debug` in development, `info` in production. Set it explicitly (`error`/`warn`/`info`/`http`/`debug`) to, for example, turn on Prisma query logging against a production instance temporarily without a redeploy that changes `NODE_ENV`.

## Request correlation (`x-request-id`)

Every request gets a UUID — reused from an inbound `x-request-id` header if a reverse proxy already set one, generated otherwise (`backend/src/logging/request-id.middleware.ts`) — stored via Node's `AsyncLocalStorage` (`request-context.ts`) for the lifetime of the request and echoed back as a response header. Every log line written anywhere during that request — the HTTP access line, a Prisma query, a warning three services deep — carries the same short id prefix (`[a1b2c3d4]`), so `grep a1b2c3d4 combined-*.log` reconstructs the full story of one request across every layer it touched, without threading an id parameter through every function call. It's also returned to the client (`x-request-id` response header) — worth asking an artisan reporting a bug for it, or checking the browser's network tab.

## Where the logs are

Two sinks, always both active:

1. **Console** (`docker compose logs`) — same colored format as below.
2. **Rotated files on disk**, written by `winston-daily-rotate-file`:
   - `logs/combined-YYYY-MM-DD.log` — everything at the configured `LOG_LEVEL` and above. Kept 14 days, max 20MB/file.
   - `logs/error-YYYY-MM-DD.log` — `error` level only. Kept 30 days (longer, since this is the "what actually broke" file) — a `4xx` (`warn`) never lands here, only a `5xx` or a crash.

The point of the file sink, on top of `docker compose logs`, is that it survives a container recreation and is readable directly on the VPS's disk without going through Docker at all — see [deployment.md](deployment.md#logs) for exactly where.

## Reading logs

```bash
make logs               # docker's own log driver, both stacks, ephemeral
make logs-files          # dev: tail -f the rotated combined log on the host
make logs-errors         # dev: tail -f the rotated error-only log
make logs-files-prod     # prod: same, via docker compose exec (named volume)
make logs-errors-prod    # prod: same, errors only
```

A typical incident triage on the VPS:

```bash
make logs-errors-prod                       # what broke, most recent first
grep <request-id> backend/logs/combined-*.log   # dev: full story of one request
```

## Example lines

```
2026-07-22 21:49:44.557 INFO  [NestApplication] Nest application successfully started
2026-07-22 21:49:47.331 INFO  [a1b2c3d4] [HTTP] GET /api/health 200 15.5ms {"ip":"::1"}
2026-07-22 21:49:47.343 WARN  [f9e8d7c6] [AllExceptionsFilter] POST /api/customers -> 400 name must be a string
2026-07-22 21:49:47.345 WARN  [f9e8d7c6] [HTTP] POST /api/customers 400 20.2ms {"ip":"::1"}
2026-07-22 21:50:12.001 ERROR [7d6c5b4a] [AllExceptionsFilter] GET /api/invoices/123/pdf -> 500 Internal server error
  Error: Cannot read properties of undefined (reading 'lines')
      at InvoiceMapper.toPdfData (/app/dist/src/invoice/invoice.mapper.js:42:18)
      ...
```

## Extending it

- **A new service that needs to log**: `private readonly logger = new Logger(MyService.name)` — same as every existing service, nothing else to wire up.
- **Attaching structured extra data to a log line**: Nest's `Logger.log(message, context)` only accepts a trailing *string* context, so structured metadata has to travel as extra keys on an object instead of a second positional argument: `logger.warn({ message: 'Sourcing cap reached', remaining: 0 })` rather than `logger.warn('Sourcing cap reached', { remaining: 0 })` — the latter silently gets swallowed as a misplaced `context`. See `http-logging.middleware.ts` for the pattern.
- **This stays intentionally local-only**: no Sentry/Loki/Datadog transport, matching the single-VPS, Reliability-first posture of this project ([development-rules.md](development-rules.md)). If a real multi-instance or higher-traffic deployment ever changes that trade-off, the transport list in `backend/src/logging/winston.config.ts` is the one place to add one — every call site is already going through the same `Logger`, so nothing above that layer would need to change.
