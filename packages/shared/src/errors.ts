export type ApiError = { error: string; code?: string };

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown> | undefined;

  constructor(
    message: string,
    options: {
      code?: string | undefined;
      statusCode?: number | undefined;
      isOperational?: boolean | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = this.constructor.name;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.statusCode = options.statusCode ?? 500;
    this.isOperational = options.isOperational ?? true;
    this.context = options.context;

    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      ...(this.context ? { context: this.context } : {}),
    };
  }
}

export class NotFoundError extends AppError {
  constructor(
    message = "Resource not found",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "NOT_FOUND",
      statusCode: 404,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "VALIDATION_ERROR",
      statusCode: 400,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(
    message = "Authentication required",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "AUTHENTICATION_ERROR",
      statusCode: 401,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = "Rate limit exceeded",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "RATE_LIMIT_EXCEEDED",
      statusCode: 429,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message = "External service failure",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "EXTERNAL_SERVICE_ERROR",
      statusCode: 502,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}

export class IngestionError extends AppError {
  constructor(
    message = "Document ingestion failed",
    options: {
      code?: string | undefined;
      cause?: Error | undefined;
      context?: Record<string, unknown> | undefined;
    } = {},
  ) {
    super(message, {
      code: options.code ?? "INGESTION_ERROR",
      statusCode: 500,
      isOperational: true,
      cause: options.cause,
      context: options.context,
    });
  }
}
