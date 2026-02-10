import { Resource } from "sst";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SourceConfigEntity } from "@usopc/shared";

/**
 * Factory to create a SourceConfigEntity using the SST-linked table name.
 */
export function createSourceConfigEntity(): SourceConfigEntity {
  const tableName = (Resource as unknown as { SourceConfigs: { name: string } })
    .SourceConfigs.name;
  const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  return new SourceConfigEntity(tableName, client);
}
