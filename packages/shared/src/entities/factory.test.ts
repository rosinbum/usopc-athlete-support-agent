import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";

// Mock the pool module to avoid needing DATABASE_URL
const mockPool = {} as Pool;
vi.mock("../pool.js", () => ({
  getPool: vi.fn(() => mockPool),
}));

import {
  createSourceConfigEntity,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
  createInviteEntity,
  createFeedbackEntity,
  createAccessRequestEntity,
  createDiscoveryRunEntity,
} from "./factory.js";

import { SourceConfigEntityPg } from "./pg/SourceConfigEntityPg.js";
import { IngestionLogEntityPg } from "./pg/IngestionLogEntityPg.js";
import { DiscoveredSourceEntityPg } from "./pg/DiscoveredSourceEntityPg.js";
import { InviteEntityPg } from "./pg/InviteEntityPg.js";
import { FeedbackEntityPg } from "./pg/FeedbackEntityPg.js";
import { AccessRequestEntityPg } from "./pg/AccessRequestEntityPg.js";
import { DiscoveryRunEntityPg } from "./pg/DiscoveryRunEntityPg.js";

describe("Entity factory functions", () => {
  it("createSourceConfigEntity returns SourceConfigEntityPg", () => {
    expect(createSourceConfigEntity()).toBeInstanceOf(SourceConfigEntityPg);
  });

  it("createIngestionLogEntity returns IngestionLogEntityPg", () => {
    expect(createIngestionLogEntity()).toBeInstanceOf(IngestionLogEntityPg);
  });

  it("createDiscoveredSourceEntity returns DiscoveredSourceEntityPg", () => {
    expect(createDiscoveredSourceEntity()).toBeInstanceOf(
      DiscoveredSourceEntityPg,
    );
  });

  it("createInviteEntity returns InviteEntityPg", () => {
    expect(createInviteEntity()).toBeInstanceOf(InviteEntityPg);
  });

  it("createFeedbackEntity returns FeedbackEntityPg", () => {
    expect(createFeedbackEntity()).toBeInstanceOf(FeedbackEntityPg);
  });

  it("createAccessRequestEntity returns AccessRequestEntityPg", () => {
    expect(createAccessRequestEntity()).toBeInstanceOf(AccessRequestEntityPg);
  });

  it("createDiscoveryRunEntity returns DiscoveryRunEntityPg", () => {
    expect(createDiscoveryRunEntity()).toBeInstanceOf(DiscoveryRunEntityPg);
  });
});
