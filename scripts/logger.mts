/**
 * Universal Structured CLI Logger for VHS Studio Pro scripts (TypeScript .mts)
 * Standard TypeScript with object union types (type-strip compatible).
 */

export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SUCCESS: 'SUCCESS',
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
} as const;

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatPrefix(level: LogLevelType, color: string): string {
  const ts = `${COLORS.dim}[${formatTimestamp()}]${COLORS.reset}`;
  const badge = `${color}${COLORS.bold}[${level}]${COLORS.reset}`;
  return `${ts} ${badge}`;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (process.env.DEBUG || process.env.VERBOSE) {
      process.stdout.write(`${formatPrefix(LogLevel.DEBUG, COLORS.gray)} ${args.map(String).join(' ')}\n`);
    }
  },

  info(...args: unknown[]): void {
    process.stdout.write(`${formatPrefix(LogLevel.INFO, COLORS.cyan)} ${args.map(String).join(' ')}\n`);
  },

  warn(...args: unknown[]): void {
    process.stderr.write(`${formatPrefix(LogLevel.WARN, COLORS.yellow)} ${args.map(String).join(' ')}\n`);
  },

  error(...args: unknown[]): void {
    process.stderr.write(`${formatPrefix(LogLevel.ERROR, COLORS.red)} ${args.map(String).join(' ')}\n`);
  },

  success(...args: unknown[]): void {
    process.stdout.write(`${formatPrefix(LogLevel.SUCCESS, COLORS.green)} ${args.map(String).join(' ')}\n`);
  },
};
