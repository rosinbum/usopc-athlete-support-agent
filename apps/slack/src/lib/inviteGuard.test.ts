import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUsersInfo = vi.fn();
const mockIsInvited = vi.fn();

vi.mock("../slack/client.js", () => ({
  getSlackClient: () => ({
    users: { info: mockUsersInfo },
  }),
}));

vi.mock("@usopc/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usopc/shared")>();
  return {
    ...actual,
    createLogger: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    createInviteEntity: () => ({ isInvited: mockIsInvited }),
  };
});

import { isUserInvited } from "./inviteGuard.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isUserInvited", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the user is on the invite list", async () => {
    mockUsersInfo.mockResolvedValue({
      ok: true,
      user: { profile: { email: "athlete@example.com" } },
    });
    mockIsInvited.mockResolvedValue(true);

    const result = await isUserInvited("U123");

    expect(result).toBe(true);
    expect(mockUsersInfo).toHaveBeenCalledWith({ user: "U123" });
    expect(mockIsInvited).toHaveBeenCalledWith("athlete@example.com");
  });

  it("returns false when the user is not on the invite list", async () => {
    mockUsersInfo.mockResolvedValue({
      ok: true,
      user: { profile: { email: "outsider@example.com" } },
    });
    mockIsInvited.mockResolvedValue(false);

    const result = await isUserInvited("U456");

    expect(result).toBe(false);
  });

  it("returns false when the user profile has no email", async () => {
    mockUsersInfo.mockResolvedValue({
      ok: true,
      user: { profile: {} },
    });

    const result = await isUserInvited("U789");

    expect(result).toBe(false);
    expect(mockIsInvited).not.toHaveBeenCalled();
  });

  it("returns false when the Slack API returns not-ok", async () => {
    mockUsersInfo.mockResolvedValue({ ok: false });

    const result = await isUserInvited("U000");

    expect(result).toBe(false);
    expect(mockIsInvited).not.toHaveBeenCalled();
  });

  it("returns false when the Slack API throws", async () => {
    mockUsersInfo.mockRejectedValue(new Error("Slack API error"));

    const result = await isUserInvited("U999");

    expect(result).toBe(false);
    expect(mockIsInvited).not.toHaveBeenCalled();
  });
});
