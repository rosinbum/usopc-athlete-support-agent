import { Table } from "dynamodb-onetable";
import { createAppTable } from "./table.js";
import { AppTableSchema } from "./schema.js";
import { SourceConfigEntity } from "./SourceConfigEntity.js";
import { IngestionLogEntity } from "./IngestionLogEntity.js";
import { DiscoveredSourceEntity } from "./DiscoveredSourceEntity.js";
import { InviteEntity } from "./InviteEntity.js";
import { FeedbackEntity } from "./FeedbackEntity.js";
import { AccessRequestEntity } from "./AccessRequestEntity.js";
import { DiscoveryRunEntity } from "./DiscoveryRunEntity.js";
import { getResource } from "../resources.js";

const tableCache = new Map<string, Table<typeof AppTableSchema>>();

function getOrCreateAppTable(tableName: string): Table<typeof AppTableSchema> {
  const cached = tableCache.get(tableName);
  if (cached) return cached;
  const table = createAppTable(tableName);
  tableCache.set(tableName, table);
  return table;
}

export function getAppTableName(): string {
  return getResource("AppTable").name;
}

export function createSourceConfigEntity(
  tableName?: string,
): SourceConfigEntity {
  return new SourceConfigEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}

export function createIngestionLogEntity(
  tableName?: string,
): IngestionLogEntity {
  return new IngestionLogEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}

export function createDiscoveredSourceEntity(
  tableName?: string,
): DiscoveredSourceEntity {
  return new DiscoveredSourceEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}

export function createInviteEntity(tableName?: string): InviteEntity {
  return new InviteEntity(getOrCreateAppTable(tableName ?? getAppTableName()));
}

export function createFeedbackEntity(tableName?: string): FeedbackEntity {
  return new FeedbackEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}

export function createAccessRequestEntity(
  tableName?: string,
): AccessRequestEntity {
  return new AccessRequestEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}

export function createDiscoveryRunEntity(
  tableName?: string,
): DiscoveryRunEntity {
  return new DiscoveryRunEntity(
    getOrCreateAppTable(tableName ?? getAppTableName()),
  );
}
