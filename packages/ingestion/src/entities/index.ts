import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
} from "./SourceConfigEntity.js";

export {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
};

/**
 * Get the SourceConfigs table name from SST Resource or environment variable.
 */
export function getSourceConfigTableName(): string {
  // Check env first (for local development or testing)
  if (process.env.SOURCE_CONFIG_TABLE_NAME) {
    return process.env.SOURCE_CONFIG_TABLE_NAME;
  }

  // Use SST Resource binding
  try {
    return (Resource as any).SourceConfigs.name;
  } catch {
    throw new Error(
      "SOURCE_CONFIG_TABLE_NAME env var not set and SST Resource not available",
    );
  }
}

/**
 * Factory function to create a SourceConfigEntity with SST integration.
 */
export function createSourceConfigEntity(): SourceConfigEntity {
  const tableName = getSourceConfigTableName();
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return new SourceConfigEntity(tableName, client);
}
