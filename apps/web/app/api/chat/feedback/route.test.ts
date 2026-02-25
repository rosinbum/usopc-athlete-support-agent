import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn().mockResolvedValue({ id: "fb-1", score: 1 }),
}));

vi.mock("../../../../auth.js", () => ({
  auth: mockAuth,
}));

vi.mock("@usopc/shared", () => ({
  createFeedbackEntity: vi.fn(() => ({ create: mockCreate })),
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { POST } from "./route.js";

function makeRequest(body: unknown, session?: unknown) {
  mockAuth.mockResolvedValue(session ?? null);
  return new Request("http://localhost/api/chat/feedback", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const validBody = {
  conversationId: "123e4567-e89b-12d3-a456-426614174000",
  messageId: "msg-1",
  score: 1,
};

const authenticatedSession = {
  user: { email: "athlete@example.com", role: "athlete" },
};

describe("POST /api/chat/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication (SEC-02)", () => {
    it("returns 401 when no session exists", async () => {
      const response = await POST(makeRequest(validBody, null));
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns 401 when session has no email", async () => {
      const response = await POST(
        makeRequest(validBody, { user: { role: "athlete" } }),
      );

      expect(response.status).toBe(401);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("stamps userId from authenticated session on feedback", async () => {
      await POST(makeRequest(validBody, authenticatedSession));

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "athlete@example.com",
          channel: "web",
        }),
      );
    });
  });

  describe("validation", () => {
    it("returns 400 for invalid JSON body", async () => {
      mockAuth.mockResolvedValue(authenticatedSession);
      const req = new Request("http://localhost/api/chat/feedback", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });

      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it("returns 400 when conversationId is not a UUID", async () => {
      const response = await POST(
        makeRequest(
          { ...validBody, conversationId: "not-uuid" },
          authenticatedSession,
        ),
      );

      expect(response.status).toBe(400);
    });

    it("returns 201 with valid input and auth", async () => {
      const response = await POST(makeRequest(validBody, authenticatedSession));

      expect(response.status).toBe(201);
    });
  });

  describe("error handling (SEC-09)", () => {
    it("does not leak error details to client", async () => {
      mockCreate.mockRejectedValueOnce(
        new Error("DynamoDB: Table 'AppTable' not found in region us-east-1"),
      );

      const response = await POST(makeRequest(validBody, authenticatedSession));
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.error).toBe("Failed to create feedback");
      expect(body.detail).toBeUndefined();
    });
  });
});
