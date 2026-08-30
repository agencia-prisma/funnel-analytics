export interface LogContext {
  actor_user_id?: string;
  error_code?: string;
  event_id?: string;
  journey_id?: string;
  pixel_id?: string;
  request_id?: string;
  trace_id?: string;
  workspace_id?: string;
}

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

interface StructuredLog extends LogContext {
  level: LogLevel;
  message: string;
  service: string;
  timestamp: string;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
}

export function createLogger(service: string): Logger {
  const write = (
    level: LogLevel,
    message: string,
    context: LogContext = {},
  ) => {
    const entry: StructuredLog = {
      ...context,
      level,
      message,
      service,
      timestamp: new Date().toISOString(),
    };

    const output = JSON.stringify(entry);

    if (level === 'error') {
      console.error(output);
      return;
    }

    if (level === 'warn') {
      console.warn(output);
      return;
    }

    console.log(output);
  };

  return {
    debug: (message, context) => write('debug', message, context),
    error: (message, context) => write('error', message, context),
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
  };
}
