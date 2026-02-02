export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  service?: string;
  requestId?: string;
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getConfiguredLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  const configuredLevel = getConfiguredLevel();
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

function formatEntry(
  level: LogLevel,
  message: string,
  defaultContext?: LogContext,
  callContext?: LogContext,
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...defaultContext,
    ...callContext,
  };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

export function createLogger(defaultContext?: LogContext): Logger {
  function log(
    level: LogLevel,
    message: string,
    context?: LogContext,
  ): void {
    if (!shouldLog(level)) {
      return;
    }

    const entry = formatEntry(level, message, defaultContext, context);
    const json = JSON.stringify(entry);

    if (level === "error") {
      process.stderr.write(json + "\n");
    } else {
      process.stdout.write(json + "\n");
    }
  }

  return {
    debug(message: string, context?: LogContext): void {
      log("debug", message, context);
    },
    info(message: string, context?: LogContext): void {
      log("info", message, context);
    },
    warn(message: string, context?: LogContext): void {
      log("warn", message, context);
    },
    error(message: string, context?: LogContext): void {
      log("error", message, context);
    },
    child(context: LogContext): Logger {
      const mergedContext = { ...defaultContext, ...context };
      return createLogger(mergedContext);
    },
  };
}

export const logger = createLogger({ service: "usopc-agent" });
