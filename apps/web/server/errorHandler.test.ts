import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NotificationService,
  resetDefaultNotificationService,
} from "@usopc/shared";
import type { NextFunction, Request, Response } from "express";
import { webErrorHandler } from "./errorHandler.js";

describe("webErrorHandler", () => {
  let sendRuntimeAlert: ReturnType<typeof vi.fn>;
  let res: Partial<Response>;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let sendSpy: ReturnType<typeof vi.fn>;
  let typeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetDefaultNotificationService();
    sendRuntimeAlert = vi.fn().mockResolvedValue(true);
    vi.spyOn(
      NotificationService.prototype,
      "sendRuntimeAlert",
    ).mockImplementation(sendRuntimeAlert);

    jsonSpy = vi.fn();
    sendSpy = vi.fn();
    typeSpy = vi.fn().mockImplementation(() => ({ send: sendSpy }));
    statusSpy = vi
      .fn()
      .mockImplementation(() => ({
        json: jsonSpy,
        type: typeSpy,
        send: sendSpy,
      }));

    res = {
      headersSent: false,
      status: statusSpy as unknown as Response["status"],
    } as Partial<Response>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetDefaultNotificationService();
  });

  function makeReq(path = "/api/chat", method = "POST"): Partial<Request> {
    return { path, method } as Partial<Request>;
  }

  const next: NextFunction = vi.fn();

  it("responds with 500 JSON on /api routes and fires a web_error alert", () => {
    webErrorHandler(
      new Error("db down"),
      makeReq("/api/chat") as Request,
      res as Response,
      next,
    );

    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "web_error",
        service: expect.stringContaining("web:500"),
      }),
    );
  });

  it("responds with plain text on non-api routes", () => {
    webErrorHandler(
      new Error("boom"),
      makeReq("/chat", "GET") as Request,
      res as Response,
      next,
    );
    expect(typeSpy).toHaveBeenCalledWith("text/plain");
    expect(sendSpy).toHaveBeenCalledWith("Internal Server Error");
  });

  it("does not alert on 4xx client errors", () => {
    const err = Object.assign(new Error("Not Found"), { statusCode: 404 });
    webErrorHandler(err, makeReq("/api/x") as Request, res as Response, next);
    expect(statusSpy).toHaveBeenCalledWith(404);
    expect(sendRuntimeAlert).not.toHaveBeenCalled();
  });

  it("uses the quota_exceeded kind when the error is a provider quota exhaustion", () => {
    const err = Object.assign(new Error("insufficient_quota 429"), {
      status: 429,
    });
    webErrorHandler(
      err,
      makeReq("/api/chat") as Request,
      res as Response,
      next,
    );
    expect(sendRuntimeAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "quota_exceeded",
        service: "web-quota",
      }),
    );
  });

  it("does nothing when headers have already been sent", () => {
    (res as { headersSent: boolean }).headersSent = true;
    webErrorHandler(
      new Error("too late"),
      makeReq("/api/chat") as Request,
      res as Response,
      next,
    );
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it("coerces non-Error throws into a 500 response", () => {
    webErrorHandler(
      "string error",
      makeReq("/api/x") as Request,
      res as Response,
      next,
    );
    expect(statusSpy).toHaveBeenCalledWith(500);
    expect(jsonSpy).toHaveBeenCalledWith(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
  });
});
