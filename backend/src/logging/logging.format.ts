import { format } from 'winston';
import type { Format } from 'logform';
import { RequestContext } from './request-context';

// Full ANSI escape codes, not winston's built-in colorize(): colorize() only
// paints the `level` field, but the whole point here is "glance at a
// terminal/tail and know the severity instantly" — so the entire line is
// painted, including on the file transport (a colored file is still exactly
// as readable with `cat`/`tail` on a Linux server, and far more readable
// than a plain one when grepping for ERROR among thousands of lines).
const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
} as const;

const LEVEL_STYLE: Record<string, { color: string; label: string }> = {
  error: { color: ANSI.red + ANSI.bold, label: 'ERROR' },
  warn: { color: ANSI.yellow, label: 'WARN ' },
  info: { color: ANSI.green, label: 'INFO ' },
  http: { color: ANSI.magenta, label: 'HTTP ' },
  debug: { color: ANSI.gray, label: 'DEBUG' },
};

function styleFor(level: string) {
  return LEVEL_STYLE[level] ?? { color: ANSI.cyan, label: level.toUpperCase().padEnd(5) };
}

// nest-winston hands Nest's `context` (the class name passed to `new
// Logger(X.name)`) through as `info.context`; everything else Nest attaches
// (ms since last log, trace for errors) rides along too.
interface NestWinstonInfo {
  level: string;
  message: unknown;
  timestamp?: string;
  context?: string;
  trace?: string;
  stack?: string;
  [key: string]: unknown;
}

export const coloredLineFormat: Format = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  format.printf((info) => {
    const { level, message, timestamp, context, trace, stack, ...rest } = info as NestWinstonInfo;
    const { color, label } = styleFor(level);
    const requestId = RequestContext.getRequestId();

    const parts = [
      `${ANSI.dim}${timestamp}${ANSI.reset}`,
      `${color}${label}${ANSI.reset}`,
      requestId ? `${ANSI.cyan}[${requestId.slice(0, 8)}]${ANSI.reset}` : undefined,
      context ? `${ANSI.bold}[${context}]${ANSI.reset}` : undefined,
      `${color}${String(message)}${ANSI.reset}`,
    ].filter(Boolean);

    // Anything else passed to logger.log('msg', { extra }) — e.g. the
    // HTTP logging middleware's { method, statusCode, durationMs, ip }.
    const metaKeys = Object.keys(rest).filter((key) => key !== 'ms' && key !== 'splat');
    const meta =
      metaKeys.length > 0 ? ` ${ANSI.dim}${JSON.stringify(pick(rest, metaKeys))}${ANSI.reset}` : '';

    // nest-winston's object-form Logger.error() always attaches a `stack`
    // key, even with no trace ([undefined]) — normalize both that array
    // shape and a plain string into one usable value, or nothing.
    const rawStack = stack ?? trace;
    const stackTrace = Array.isArray(rawStack)
      ? rawStack
          .filter((line): line is string => typeof line === 'string' && line.length > 0)
          .join('\n')
      : typeof rawStack === 'string'
        ? rawStack
        : undefined;
    const stackLines = stackTrace
      ? `\n${ANSI.red}${stackTrace
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')}${ANSI.reset}`
      : '';

    return `${parts.join(' ')}${meta}${stackLines}`;
  }),
);

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) result[key] = source[key];
  return result;
}
