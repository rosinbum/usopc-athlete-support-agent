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
 * Get the SourceConfigs table name from SST Resource.
 */
export function getSourceConfigTableName(): string {
  try {
    return (Resource as unknown as { SourceConfigs: { name: string } })
      .SourceConfigs.name;
  } catch {
    throw new Error(
      "SST Resource SourceConfigs not available. Run with 'sst shell' or deploy with SST.",
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
