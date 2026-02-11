import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import Dynamo from "dynamodb-onetable/Dynamo";
import { Table } from "dynamodb-onetable";
import { AppTableSchema } from "./schema.js";

/**
 * Create a OneTable Table instance connected to the AppTable.
 *
 * @param tableName - DynamoDB table name (from SST Resource)
 * @param client - Optional pre-configured DynamoDBClient (useful for testing)
 */
export function createAppTable(
  tableName: string,
  client?: DynamoDBClient,
): Table<typeof AppTableSchema> {
  const dynamoClient = client ?? new DynamoDBClient({});
  return new Table({
    name: tableName,
    client: new Dynamo({ client: dynamoClient }),
    schema: AppTableSchema,
    partial: true, // Allow partial updates
  });
}
