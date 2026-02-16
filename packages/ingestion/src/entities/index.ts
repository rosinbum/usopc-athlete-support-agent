import { Resource } from "sst";
import {
  createAppTable,
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
  IngestionLogEntity,
  type IngestionLog,
  DiscoveredSourceEntity,
  type DiscoveredSource,
} from "@usopc/shared";

export {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
};

export { IngestionLogEntity, type IngestionLog };

export { DiscoveredSourceEntity, type DiscoveredSource };

/**
 * Get the AppTable name from SST Resource.
 */
export function getAppTableName(): string {
  try {
    return (Resource as unknown as { AppTable: { name: string } }).AppTable
      .name;
  } catch {
    throw new Error(
      "SST Resource AppTable not available. Run with 'sst shell' or deploy with SST.",
    );
  }
}

/**
 * Factory function to create a SourceConfigEntity with SST integration.
 */
export function createSourceConfigEntity(): SourceConfigEntity {
  const table = createAppTable(getAppTableName());
  return new SourceConfigEntity(table);
}

/**
 * Factory function to create an IngestionLogEntity with SST integration.
 */
export function createIngestionLogEntity(): IngestionLogEntity {
  const table = createAppTable(getAppTableName());
  return new IngestionLogEntity(table);
}

/**
 * Factory function to create a DiscoveredSourceEntity with SST integration.
 */
export function createDiscoveredSourceEntity(): DiscoveredSourceEntity {
  const table = createAppTable(getAppTableName());
  return new DiscoveredSourceEntity(table);
}
