import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { createLogger, type AuthorityLevel } from "../index.js";

const logger = createLogger({ service: "source-config-entity" });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceConfig {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
  enabled: boolean;
  lastIngestedAt: string | null;
  lastContentHash: string | null;
  consecutiveFailures: number;
  lastError: string | null;
  s3Key: string | null;
  s3VersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSourceInput {
  id: string;
  title: string;
  documentType: string;
  topicDomains: string[];
  url: string;
  format: "pdf" | "html" | "text";
  ngbId: string | null;
  priority: "high" | "medium" | "low";
  description: string;
  authorityLevel: AuthorityLevel;
}

export interface MarkSuccessOptions {
  s3Key?: string;
  s3VersionId?: string;
}

// ---------------------------------------------------------------------------
// DynamoDB item type (includes pk/sk)
// ---------------------------------------------------------------------------

interface SourceConfigItem extends Omit<SourceConfig, "enabled"> {
  pk: string;
  sk: string;
  enabled: string; // Stored as string for GSI (DynamoDB requires string keys)
}

// ---------------------------------------------------------------------------
// SourceConfigEntity
// ---------------------------------------------------------------------------

/**
 * Entity class for managing source configurations in DynamoDB.
 *
 * Table structure:
 * - PK: SOURCE#{id}
 * - SK: CONFIG
 *
 * GSIs:
 * - ngbId-index: Query sources by NGB
 * - enabled-priority-index: Query enabled sources
 */
export class SourceConfigEntity {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(tableName: string, client?: DynamoDBDocumentClient) {
    this.tableName = tableName;
    this.client = client ?? DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  // ---------------------------------------------------------------------------
  // Key generation
  // ---------------------------------------------------------------------------

  private pk(id: string): string {
    return `SOURCE#${id}`;
  }

  private sk(): string {
    return "CONFIG";
  }

  // ---------------------------------------------------------------------------
  // Marshalling
  // ---------------------------------------------------------------------------

  private toItem(config: SourceConfig): SourceConfigItem {
    const { ngbId, ...rest } = config;
    const item: Record<string, unknown> = {
      pk: this.pk(config.id),
      sk: this.sk(),
      ...rest,
      // Store enabled as string for GSI (DynamoDB GSI keys must be strings)
      enabled: config.enabled ? "true" : "false",
    };
    // Only include ngbId if it's not null (DynamoDB GSI keys cannot be null)
    // This makes the GSI sparse - items without ngbId won't appear in ngbId-index
    if (ngbId !== null) {
      item.ngbId = ngbId;
    }
    return item as unknown as SourceConfigItem;
  }

  private fromItem(item: Record<string, unknown>): SourceConfig {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { pk, sk, ...rest } = item;
    return {
      ...rest,
      // Convert enabled back to boolean
      enabled: rest.enabled === true || rest.enabled === "true",
      // Convert missing ngbId to null (sparse GSI means it's omitted when null)
      ngbId: (rest.ngbId as string) ?? null,
    } as SourceConfig;
  }

  // ---------------------------------------------------------------------------
  // CRUD operations
  // ---------------------------------------------------------------------------

  /**
   * Create a new source configuration.
   */
  async create(input: CreateSourceInput): Promise<SourceConfig> {
    const now = new Date().toISOString();

    const config: SourceConfig = {
      ...input,
      enabled: true,
      lastIngestedAt: null,
      lastContentHash: null,
      consecutiveFailures: 0,
      lastError: null,
      s3Key: null,
      s3VersionId: null,
      createdAt: now,
      updatedAt: now,
    };

    const item = this.toItem(config);

    logger.info(`Creating source config: ${input.id}`, { sourceId: input.id });

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );

    return config;
  }

  /**
   * Get a source configuration by ID.
   */
  async getById(id: string): Promise<SourceConfig | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          pk: this.pk(id),
          sk: this.sk(),
        },
      }),
    );

    if (!result.Item) {
      return null;
    }

    return this.fromItem(result.Item);
  }

  /**
   * Get all source configurations (enabled and disabled).
   * Paginates automatically if results exceed 1 MB.
   */
  async getAll(): Promise<SourceConfig[]> {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: this.tableName,
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items.map((item) => this.fromItem(item));
  }

  /**
   * Get all enabled source configurations.
   * Paginates automatically if results exceed 1 MB.
   */
  async getAllEnabled(): Promise<SourceConfig[]> {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "enabled-priority-index",
          KeyConditionExpression: "enabled = :enabled",
          ExpressionAttributeValues: {
            ":enabled": "true",
          },
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items.map((item) => this.fromItem(item));
  }

  /**
   * Get source configurations by NGB ID.
   * Paginates automatically if results exceed 1 MB.
   */
  async getByNgb(ngbId: string): Promise<SourceConfig[]> {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: "ngbId-index",
          KeyConditionExpression: "ngbId = :ngbId",
          ExpressionAttributeValues: {
            ":ngbId": ngbId,
          },
          ExclusiveStartKey: lastKey,
        }),
      );
      items.push(...(result.Items ?? []));
      lastKey = result.LastEvaluatedKey;
    } while (lastKey);

    return items.map((item) => this.fromItem(item));
  }

  /**
   * Update a source configuration.
   */
  async update(
    id: string,
    updates: Partial<Omit<SourceConfig, "id" | "createdAt">>,
  ): Promise<SourceConfig> {
    const now = new Date().toISOString();

    // Build update expression dynamically
    const expressionParts: string[] = [];
    const expressionValues: Record<string, unknown> = {
      ":updatedAt": now,
    };
    const expressionNames: Record<string, string> = {};

    expressionParts.push("updatedAt = :updatedAt");

    for (const [key, value] of Object.entries(updates)) {
      if (key === "enabled") {
        // Convert boolean to string for GSI
        expressionParts.push(`#${key} = :${key}`);
        expressionValues[`:${key}`] = value ? "true" : "false";
        expressionNames[`#${key}`] = key;
      } else {
        expressionParts.push(`#${key} = :${key}`);
        expressionValues[`:${key}`] = value;
        expressionNames[`#${key}`] = key;
      }
    }

    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: this.pk(id),
          sk: this.sk(),
        },
        UpdateExpression: `SET ${expressionParts.join(", ")}`,
        ExpressionAttributeValues: expressionValues,
        ExpressionAttributeNames:
          Object.keys(expressionNames).length > 0 ? expressionNames : undefined,
        ReturnValues: "ALL_NEW",
      }),
    );

    return this.fromItem(result.Attributes!);
  }

  /**
   * Delete a source configuration.
   */
  async delete(id: string): Promise<void> {
    logger.info(`Deleting source config: ${id}`, { sourceId: id });

    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: {
          pk: this.pk(id),
          sk: this.sk(),
        },
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Ingestion status helpers
  // ---------------------------------------------------------------------------

  /**
   * Mark a source as successfully ingested.
   */
  async markSuccess(
    id: string,
    contentHash: string,
    options?: MarkSuccessOptions,
  ): Promise<void> {
    const now = new Date().toISOString();

    logger.info(`Marking source success: ${id}`, {
      sourceId: id,
      contentHash,
    });

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: this.pk(id),
          sk: this.sk(),
        },
        UpdateExpression: `SET
          lastContentHash = :contentHash,
          lastIngestedAt = :ingestedAt,
          consecutiveFailures = :failures,
          lastError = :lastError,
          s3Key = :s3Key,
          s3VersionId = :s3VersionId,
          updatedAt = :updatedAt`,
        ExpressionAttributeValues: {
          ":contentHash": contentHash,
          ":ingestedAt": now,
          ":failures": 0,
          ":lastError": null,
          ":s3Key": options?.s3Key ?? null,
          ":s3VersionId": options?.s3VersionId ?? null,
          ":updatedAt": now,
        },
      }),
    );
  }

  /**
   * Mark a source as failed.
   */
  async markFailure(id: string, error: string): Promise<void> {
    const now = new Date().toISOString();

    logger.warn(`Marking source failure: ${id}`, {
      sourceId: id,
      error,
    });

    await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: {
          pk: this.pk(id),
          sk: this.sk(),
        },
        UpdateExpression: `SET
          consecutiveFailures = consecutiveFailures + :inc,
          lastError = :lastError,
          updatedAt = :updatedAt`,
        ExpressionAttributeValues: {
          ":inc": 1,
          ":lastError": error,
          ":updatedAt": now,
        },
      }),
    );
  }

  /**
   * Disable a source.
   */
  async disable(id: string): Promise<void> {
    logger.info(`Disabling source: ${id}`, { sourceId: id });

    await this.update(id, { enabled: false });
  }

  /**
   * Enable a source.
   */
  async enable(id: string): Promise<void> {
    logger.info(`Enabling source: ${id}`, { sourceId: id });

    await this.update(id, { enabled: true });
  }
}
