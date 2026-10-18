/**
 * Universal Frontend Logger for VHS Studio Pro
 * Centralizes all console logging with log levels and environment awareness.
 */

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4,
} as const;

export type LogLevelType = (typeof LogLevel)[keyof typeof LogLevel];

class StudioLogger {
  private level: LogLevelType = import.meta.env.MODE === 'production' ? LogLevel.INFO : LogLevel.DEBUG;

  public setLevel(newLevel: LogLevelType): void {
    this.level = newLevel;
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      // eslint-disable-next-line no-console
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      // eslint-disable-next-line no-console
      console.info(`[INFO] ${message}`, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      // eslint-disable-next-line no-console
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      // eslint-disable-next-line no-console
      console.error(`[ERROR] ${message}`, ...args);
    }
  }
}

export const logger = new StudioLogger();
