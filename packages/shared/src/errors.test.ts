import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  ExternalServiceError,
  IngestionError,
} from "./errors.js";

describe("AppError", () => {
  it("creates error with default values", () => {
    const error = new AppError("Something went wrong");

    expect(error.message).toBe("Something went wrong");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.context).toBeUndefined();
    expect(error.name).toBe("AppError");
  });

  it("creates error with custom options", () => {
    const error = new AppError("Custom error", {
      code: "CUSTOM_CODE",
      statusCode: 418,
      isOperational: false,
      context: { userId: "123" },
    });

    expect(error.code).toBe("CUSTOM_CODE");
    expect(error.statusCode).toBe(418);
    expect(error.isOperational).toBe(false);
    expect(error.context).toEqual({ userId: "123" });
  });

  it("supports error cause", () => {
    const cause = new Error("Original error");
    const error = new AppError("Wrapped error", { cause });

    expect(error.cause).toBe(cause);
  });

  it("is instanceof Error", () => {
    const error = new AppError("Test");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it("has stack trace", () => {
    const error = new AppError("Test");
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain("AppError");
  });

  describe("toJSON", () => {
    it("serializes error without context", () => {
      const error = new AppError("Test message", {
        code: "TEST_CODE",
        statusCode: 400,
      });

      const json = error.toJSON();

      expect(json).toEqual({
        name: "AppError",
        message: "Test message",
        code: "TEST_CODE",
        statusCode: 400,
        isOperational: true,
      });
    });

    it("serializes error with context", () => {
      const error = new AppError("Test", {
        context: { key: "value" },
      });

      const json = error.toJSON();

      expect(json.context).toEqual({ key: "value" });
    });
  });
});

describe("NotFoundError", () => {
  it("has correct defaults", () => {
    const error = new NotFoundError();

    expect(error.message).toBe("Resource not found");
    expect(error.code).toBe("NOT_FOUND");
    expect(error.statusCode).toBe(404);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("NotFoundError");
  });

  it("accepts custom message", () => {
    const error = new NotFoundError("User not found");
    expect(error.message).toBe("User not found");
  });

  it("accepts custom code", () => {
    const error = new NotFoundError("Not found", { code: "USER_NOT_FOUND" });
    expect(error.code).toBe("USER_NOT_FOUND");
  });

  it("accepts context", () => {
    const error = new NotFoundError("Not found", { context: { id: "123" } });
    expect(error.context).toEqual({ id: "123" });
  });

  it("is instanceof AppError", () => {
    const error = new NotFoundError();
    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe("ValidationError", () => {
  it("has correct defaults", () => {
    const error = new ValidationError();

    expect(error.message).toBe("Validation failed");
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("ValidationError");
  });

  it("accepts custom message and context", () => {
    const error = new ValidationError("Invalid email format", {
      context: { field: "email", value: "invalid" },
    });

    expect(error.message).toBe("Invalid email format");
    expect(error.context).toEqual({ field: "email", value: "invalid" });
  });
});

describe("AuthenticationError", () => {
  it("has correct defaults", () => {
    const error = new AuthenticationError();

    expect(error.message).toBe("Authentication required");
    expect(error.code).toBe("AUTHENTICATION_ERROR");
    expect(error.statusCode).toBe(401);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("AuthenticationError");
  });

  it("accepts custom message", () => {
    const error = new AuthenticationError("Invalid token");
    expect(error.message).toBe("Invalid token");
  });
});

describe("RateLimitError", () => {
  it("has correct defaults", () => {
    const error = new RateLimitError();

    expect(error.message).toBe("Rate limit exceeded");
    expect(error.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(error.statusCode).toBe(429);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("RateLimitError");
  });

  it("accepts context with retry info", () => {
    const error = new RateLimitError("Too many requests", {
      context: { retryAfter: 60 },
    });

    expect(error.context).toEqual({ retryAfter: 60 });
  });
});

describe("ExternalServiceError", () => {
  it("has correct defaults", () => {
    const error = new ExternalServiceError();

    expect(error.message).toBe("External service failure");
    expect(error.code).toBe("EXTERNAL_SERVICE_ERROR");
    expect(error.statusCode).toBe(502);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("ExternalServiceError");
  });

  it("accepts cause for wrapped errors", () => {
    const cause = new Error("Connection refused");
    const error = new ExternalServiceError("Anthropic API failed", { cause });

    expect(error.cause).toBe(cause);
  });
});

describe("IngestionError", () => {
  it("has correct defaults", () => {
    const error = new IngestionError();

    expect(error.message).toBe("Document ingestion failed");
    expect(error.code).toBe("INGESTION_ERROR");
    expect(error.statusCode).toBe(500);
    expect(error.isOperational).toBe(true);
    expect(error.name).toBe("IngestionError");
  });

  it("accepts context with document info", () => {
    const error = new IngestionError("Failed to parse PDF", {
      context: { documentId: "doc-123", source: "usada.org" },
    });

    expect(error.context).toEqual({
      documentId: "doc-123",
      source: "usada.org",
    });
  });
});
