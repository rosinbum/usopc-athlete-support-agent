import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@usopc/shared", () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { createCalculateDeadlineTool } from "./calculateDeadline.js";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("calculateDeadline tool", () => {
  const tool = createCalculateDeadlineTool();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calculates Section 9 arbitration deadline (180 days)", async () => {
    const result = await tool.invoke({
      deadlineType: "section_9_arbitration",
      startDate: "2025-06-01",
    });

    expect(result).toContain("Section 9 Arbitration");
    expect(result).toContain("180 calendar days");
    expect(result).toContain("Ted Stevens");
  });

  it("calculates CAS appeal deadline (21 days)", async () => {
    const result = await tool.invoke({
      deadlineType: "cas_appeal",
      startDate: "2025-06-01",
    });

    expect(result).toContain("Court of Arbitration for Sport");
    expect(result).toContain("21 calendar days");
  });

  it("returns no-deadline message for SafeSport reports", async () => {
    const result = await tool.invoke({
      deadlineType: "safesport_report",
    });

    expect(result).toContain("No fixed deadline");
    expect(result).toContain("no statute of limitations");
  });

  it("calculates USADA whereabouts deadline (15 days)", async () => {
    const result = await tool.invoke({
      deadlineType: "usada_whereabouts",
      startDate: "2025-06-01",
    });

    expect(result).toContain("Whereabouts");
    expect(result).toContain("15 calendar days");
  });

  it("calculates team selection protest deadline (3 days)", async () => {
    const result = await tool.invoke({
      deadlineType: "team_selection_protest",
      startDate: "2025-06-01",
    });

    expect(result).toContain("Team Selection Protest");
    expect(result).toContain("3 calendar days");
  });

  it("defaults startDate to today when not provided", async () => {
    const result = await tool.invoke({
      deadlineType: "cas_appeal",
    });

    // Today is 2025-06-15, deadline = 2025-07-06
    expect(result).toContain("21 calendar days");
    expect(result).toContain("June");
  });

  it("shows EXPIRED status for past deadlines", async () => {
    // Start date far in the past: 2024-01-01 + 21 days = 2024-01-22
    // Today is 2025-06-15, so this is expired
    const result = await tool.invoke({
      deadlineType: "cas_appeal",
      startDate: "2024-01-01",
    });

    expect(result).toContain("EXPIRED");
  });

  it("shows approaching-soon warning for near deadlines", async () => {
    // Today is 2025-06-15; start 3-day deadline from 2025-06-14
    // Deadline = 2025-06-17, 2 days from today
    const result = await tool.invoke({
      deadlineType: "team_selection_protest",
      startDate: "2025-06-14",
    });

    expect(result).toContain("WARNING");
    expect(result).toContain("approaching soon");
  });

  it("returns error for invalid date format", async () => {
    const result = await tool.invoke({
      deadlineType: "cas_appeal",
      startDate: "not-a-date",
    });

    expect(result).toContain("Invalid start date");
  });

  it("includes important notes for each deadline type", async () => {
    const result = await tool.invoke({
      deadlineType: "section_9_arbitration",
      startDate: "2025-06-01",
    });

    expect(result).toContain("Important Notes:");
    expect(result).toContain("American Arbitration Association");
  });

  it("includes source reference", async () => {
    const result = await tool.invoke({
      deadlineType: "cas_appeal",
      startDate: "2025-06-01",
    });

    expect(result).toContain("CAS Code of Sports-related Arbitration");
  });
});
