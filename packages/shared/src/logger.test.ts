import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLogger, logger } from "./logger.js";

describe("createLogger", () => {
  const originalEnv = process.env;
  let stdoutWrite: typeof process.stdout.write;
  let stderrWrite: typeof process.stderr.write;
  let stdoutCalls: string[];
  let stderrCalls: string[];

  beforeEach(() => {
    process.env = { ...originalEnv };
    stdoutCalls = [];
    stderrCalls = [];

    stdoutWrite = process.stdout.write;
    stderrWrite = process.stderr.write;

    process.stdout.write = ((chunk: string) => {
      stdoutCalls.push(chunk);
      return true;
    }) as typeof process.stdout.write;

    process.stderr.write = ((chunk: string) => {
      stderrCalls.push(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.env = originalEnv;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  });

  describe("log levels", () => {
    it("logs info messages to stdout", () => {
      const log = createLogger();
      log.info("Test message");

      expect(stdoutCalls).toHaveLength(1);
      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.level).toBe("info");
      expect(output.message).toBe("Test message");
      expect(output.timestamp).toBeDefined();
    });

    it("logs error messages to stderr", () => {
      const log = createLogger();
      log.error("Error message");

      expect(stderrCalls).toHaveLength(1);
      const output = JSON.parse(stderrCalls[0]!.replace("\n", ""));
      expect(output.level).toBe("error");
      expect(output.message).toBe("Error message");
    });

    it("logs warn messages to stdout", () => {
      const log = createLogger();
      log.warn("Warning message");

      expect(stdoutCalls).toHaveLength(1);
      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.level).toBe("warn");
    });

    it("logs debug messages when LOG_LEVEL is debug", () => {
      process.env.LOG_LEVEL = "debug";
      const log = createLogger();
      log.debug("Debug message");

      expect(stdoutCalls).toHaveLength(1);
      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.level).toBe("debug");
    });
  });

  describe("log level filtering", () => {
    it("filters debug messages at info level (default)", () => {
      delete process.env.LOG_LEVEL;
      const log = createLogger();
      log.debug("Should not appear");

      expect(stdoutCalls).toHaveLength(0);
    });

    it("filters debug and info at warn level", () => {
      process.env.LOG_LEVEL = "warn";
      const log = createLogger();
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(stdoutCalls).toHaveLength(1); // warn
      expect(stderrCalls).toHaveLength(1); // error
    });

    it("only shows errors at error level", () => {
      process.env.LOG_LEVEL = "error";
      const log = createLogger();
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(stdoutCalls).toHaveLength(0);
      expect(stderrCalls).toHaveLength(1);
    });

    it("shows all levels at debug level", () => {
      process.env.LOG_LEVEL = "debug";
      const log = createLogger();
      log.debug("Debug");
      log.info("Info");
      log.warn("Warn");
      log.error("Error");

      expect(stdoutCalls).toHaveLength(3); // debug, info, warn
      expect(stderrCalls).toHaveLength(1); // error
    });

    it("defaults to info level for invalid LOG_LEVEL", () => {
      process.env.LOG_LEVEL = "invalid";
      const log = createLogger();
      log.debug("Debug");
      log.info("Info");

      expect(stdoutCalls).toHaveLength(1); // only info
    });

    it("handles case-insensitive LOG_LEVEL", () => {
      process.env.LOG_LEVEL = "DEBUG";
      const log = createLogger();
      log.debug("Debug");

      expect(stdoutCalls).toHaveLength(1);
    });
  });

  describe("context", () => {
    it("includes default context in all log entries", () => {
      const log = createLogger({ service: "test-service" });
      log.info("Test");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("test-service");
    });

    it("includes call-time context", () => {
      const log = createLogger();
      log.info("Test", { requestId: "req-123" });

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.requestId).toBe("req-123");
    });

    it("merges default and call-time context", () => {
      const log = createLogger({ service: "my-service" });
      log.info("Test", { requestId: "req-123" });

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("my-service");
      expect(output.requestId).toBe("req-123");
    });

    it("call-time context overrides default context", () => {
      const log = createLogger({ service: "default" });
      log.info("Test", { service: "override" });

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("override");
    });
  });

  describe("child logger", () => {
    it("creates child with merged context", () => {
      const parent = createLogger({ service: "parent" });
      const child = parent.child({ component: "child" });
      child.info("Test");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("parent");
      expect(output.component).toBe("child");
    });

    it("child can override parent context", () => {
      const parent = createLogger({ service: "parent" });
      const child = parent.child({ service: "child" });
      child.info("Test");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("child");
    });

    it("child does not affect parent", () => {
      const parent = createLogger({ service: "parent" });
      parent.child({ extra: "child-only" });
      parent.info("Parent log");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.service).toBe("parent");
      expect(output.extra).toBeUndefined();
    });

    it("supports nested children", () => {
      const root = createLogger({ level: "root" });
      const child1 = root.child({ level: "child1" });
      const child2 = child1.child({ level: "child2" });
      child2.info("Test");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.level).toBe("child2"); // level from context overrides log level key
    });
  });

  describe("output format", () => {
    it("outputs valid JSON with newline", () => {
      const log = createLogger();
      log.info("Test");

      const call = stdoutCalls[0]!;
      expect(call.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(call)).not.toThrow();
    });

    it("includes ISO timestamp", () => {
      const log = createLogger();
      log.info("Test");

      const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
      expect(output.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );
    });
  });
});

describe("logger (default export)", () => {
  let stdoutWrite: typeof process.stdout.write;
  let stdoutCalls: string[];

  beforeEach(() => {
    stdoutCalls = [];
    stdoutWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      stdoutCalls.push(chunk);
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = stdoutWrite;
  });

  it("is preconfigured with usopc-agent service", () => {
    logger.info("Test");

    const output = JSON.parse(stdoutCalls[0]!.replace("\n", ""));
    expect(output.service).toBe("usopc-agent");
  });

  it("has all log methods", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.child).toBe("function");
  });
});
