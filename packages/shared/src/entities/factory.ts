import { getPool } from "../pool.js";
import { SourceConfigEntityPg } from "./pg/SourceConfigEntityPg.js";
import { IngestionLogEntityPg } from "./pg/IngestionLogEntityPg.js";
import { DiscoveredSourceEntityPg } from "./pg/DiscoveredSourceEntityPg.js";
import { InviteEntityPg } from "./pg/InviteEntityPg.js";
import { FeedbackEntityPg } from "./pg/FeedbackEntityPg.js";
import { AccessRequestEntityPg } from "./pg/AccessRequestEntityPg.js";
import { DiscoveryRunEntityPg } from "./pg/DiscoveryRunEntityPg.js";

export function createSourceConfigEntity(): SourceConfigEntityPg {
  return new SourceConfigEntityPg(getPool());
}

export function createIngestionLogEntity(): IngestionLogEntityPg {
  return new IngestionLogEntityPg(getPool());
}

export function createDiscoveredSourceEntity(): DiscoveredSourceEntityPg {
  return new DiscoveredSourceEntityPg(getPool());
}

export function createInviteEntity(): InviteEntityPg {
  return new InviteEntityPg(getPool());
}

export function createFeedbackEntity(): FeedbackEntityPg {
  return new FeedbackEntityPg(getPool());
}

export function createAccessRequestEntity(): AccessRequestEntityPg {
  return new AccessRequestEntityPg(getPool());
}

export function createDiscoveryRunEntity(): DiscoveryRunEntityPg {
  return new DiscoveryRunEntityPg(getPool());
}
