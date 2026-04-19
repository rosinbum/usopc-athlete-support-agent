import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationService,
  QuotaExceededError,
  resetDefaultNotificationService,
} from "@usopc/shared";
import { alertIfQuotaError, notifyOnCircuitOpen } from "./alerts.js";

describe("alertIfQuotaError", () => {
  let sendRuntimeAlert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDefaultNotificationService();
    sendRuntimeAlert = vi.fn().mockResolvedValue(true);
    vi.spyOn(
      NotificationService.prototype,
      "sendRuntimeAlert",
    ).mockImplementation(sendRuntimeAlert);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDefaultNotificationService();
  });

  it("fires a runtime alert for quota errors", () => {
    const err = Object.assign(
      new Error("429 insufficient_quota: you exceeded your current quota"),
      { status: 429 },
    );

    const returned = alertIfQuotaError("anthropic", err);

    expect(returned).toBe(err);
    expect(sendRuntimeAlert).toHaveBeenCalledTimes(1);
    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "quota_exceeded",
        service: "anthropic",
        error: err,
      }),
    );
  });

  it("fires for QuotaExceededError instances", () => {
    const err = new QuotaExceededError("out of credits");
    alertIfQuotaError("tavily", err);
    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "quota_exceeded", service: "tavily" }),
    );
  });

  it("does not fire for non-quota errors", () => {
    alertIfQuotaError("anthropic", new Error("ECONNRESET"));
    expect(sendRuntimeAlert).not.toHaveBeenCalled();
  });

  it("does not throw when the notification service rejects", async () => {
    sendRuntimeAlert.mockRejectedValue(new Error("resend down"));
    const err = Object.assign(new Error("insufficient_quota 429"), {
      status: 429,
    });
    // The function is synchronous; unhandled rejection is caught internally.
    expect(() => alertIfQuotaError("anthropic", err)).not.toThrow();
  });
});

describe("notifyOnCircuitOpen", () => {
  let sendRuntimeAlert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDefaultNotificationService();
    sendRuntimeAlert = vi.fn().mockResolvedValue(true);
    vi.spyOn(
      NotificationService.prototype,
      "sendRuntimeAlert",
    ).mockImplementation(sendRuntimeAlert);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDefaultNotificationService();
  });

  it("returns a callback that sends a circuit_opened alert with the triggering error", () => {
    const cb = notifyOnCircuitOpen("llm");
    const err = new Error("anthropic down");
    cb(err);

    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "circuit_opened",
        service: "llm",
        error: err,
        message: expect.stringContaining("anthropic down"),
      }),
    );
  });

  it("handles undefined triggering error (manual trip)", () => {
    const cb = notifyOnCircuitOpen("tavily");
    cb(undefined);
    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "circuit_opened", service: "tavily" }),
    );
  });
});
