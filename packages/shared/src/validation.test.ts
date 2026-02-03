import { describe, it, expect } from "vitest";
import {
  paginationSchema,
  uuidSchema,
  sportOrgIdSchema,
  topicDomainSchema,
  channelSchema,
  TOPIC_DOMAINS,
  CHANNELS,
} from "./validation.js";

describe("paginationSchema", () => {
  it("uses default values when not provided", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts valid page and limit", () => {
    const result = paginationSchema.parse({ page: 5, limit: 50 });
    expect(result.page).toBe(5);
    expect(result.limit).toBe(50);
  });

  it("coerces string numbers to integers", () => {
    const result = paginationSchema.parse({ page: "3", limit: "25" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(25);
  });

  it("rejects page less than 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    expect(() => paginationSchema.parse({ page: -1 })).toThrow();
  });

  it("rejects limit less than 1", () => {
    expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
    expect(() => paginationSchema.parse({ limit: -5 })).toThrow();
  });

  it("rejects limit greater than 100", () => {
    expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    expect(() => paginationSchema.parse({ limit: 1000 })).toThrow();
  });

  it("accepts limit at boundaries", () => {
    expect(paginationSchema.parse({ limit: 1 }).limit).toBe(1);
    expect(paginationSchema.parse({ limit: 100 }).limit).toBe(100);
  });

  it("rejects floats (requires integers)", () => {
    expect(() => paginationSchema.parse({ page: 2.7, limit: 30.9 })).toThrow();
    expect(() =>
      paginationSchema.parse({ page: 2.0, limit: 30 }),
    ).not.toThrow(); // .0 is valid
  });
});

describe("uuidSchema", () => {
  it("accepts valid UUID v4", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(uuidSchema.parse(uuid)).toBe(uuid);
  });

  it("accepts valid UUID with uppercase", () => {
    const uuid = "550E8400-E29B-41D4-A716-446655440000";
    expect(uuidSchema.parse(uuid)).toBe(uuid);
  });

  it("rejects invalid UUID format", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
    expect(() => uuidSchema.parse("550e8400-e29b-41d4-a716")).toThrow();
    expect(() => uuidSchema.parse("")).toThrow();
  });

  it("rejects UUID with invalid characters", () => {
    expect(() =>
      uuidSchema.parse("550e8400-e29b-41d4-a716-44665544000g"),
    ).toThrow();
  });
});

describe("sportOrgIdSchema", () => {
  it("accepts valid sport org ID", () => {
    expect(sportOrgIdSchema.parse("usa-swimming")).toBe("usa-swimming");
  });

  it("trims whitespace", () => {
    expect(sportOrgIdSchema.parse("  usa-track  ")).toBe("usa-track");
  });

  it("lowercases input", () => {
    expect(sportOrgIdSchema.parse("USA-GYMNASTICS")).toBe("usa-gymnastics");
    expect(sportOrgIdSchema.parse("UsA-TeNnIs")).toBe("usa-tennis");
  });

  it("trims and lowercases together", () => {
    expect(sportOrgIdSchema.parse("  USA-FENCING  ")).toBe("usa-fencing");
  });

  it("rejects empty string", () => {
    expect(() => sportOrgIdSchema.parse("")).toThrow();
  });

  it("rejects whitespace-only string", () => {
    expect(() => sportOrgIdSchema.parse("   ")).toThrow();
  });

  it("accepts single character", () => {
    expect(sportOrgIdSchema.parse("x")).toBe("x");
  });
});

describe("topicDomainSchema", () => {
  it("accepts all valid topic domains", () => {
    TOPIC_DOMAINS.forEach((domain) => {
      expect(topicDomainSchema.parse(domain)).toBe(domain);
    });
  });

  it("includes expected domains", () => {
    expect(TOPIC_DOMAINS).toContain("team_selection");
    expect(TOPIC_DOMAINS).toContain("dispute_resolution");
    expect(TOPIC_DOMAINS).toContain("safesport");
    expect(TOPIC_DOMAINS).toContain("anti_doping");
    expect(TOPIC_DOMAINS).toContain("eligibility");
    expect(TOPIC_DOMAINS).toContain("governance");
    expect(TOPIC_DOMAINS).toContain("athlete_rights");
  });

  it("has exactly 7 domains", () => {
    expect(TOPIC_DOMAINS.length).toBe(7);
  });

  it("rejects invalid domain", () => {
    expect(() => topicDomainSchema.parse("invalid_domain")).toThrow();
    expect(() => topicDomainSchema.parse("")).toThrow();
    expect(() => topicDomainSchema.parse("TEAM_SELECTION")).toThrow(); // case sensitive
  });
});

describe("channelSchema", () => {
  it("accepts all valid channels", () => {
    CHANNELS.forEach((channel) => {
      expect(channelSchema.parse(channel)).toBe(channel);
    });
  });

  it("includes expected channels", () => {
    expect(CHANNELS).toContain("web");
    expect(CHANNELS).toContain("api");
    expect(CHANNELS).toContain("slack");
  });

  it("has exactly 3 channels", () => {
    expect(CHANNELS.length).toBe(3);
  });

  it("rejects invalid channel", () => {
    expect(() => channelSchema.parse("discord")).toThrow();
    expect(() => channelSchema.parse("")).toThrow();
    expect(() => channelSchema.parse("WEB")).toThrow(); // case sensitive
  });
});
