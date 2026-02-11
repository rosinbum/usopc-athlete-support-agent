/**
 * OneTable schema defining the DynamoDB single-table structure
 * and all entity models for the USOPC Athlete Support Agent.
 *
 * Phase 1 implements SourceConfig; other models are defined
 * here for future phases.
 */
export const AppTableSchema = {
  format: "onetable:1.1.0",
  version: "0.0.1",
  indexes: {
    primary: { hash: "pk", sort: "sk" },
    "ngbId-index": { hash: "ngbId", sort: "pk", project: "all" },
    "enabled-priority-index": { hash: "enabled", sort: "sk", project: "all" },
    gsi1: { hash: "gsi1pk", sort: "gsi1sk", project: "all" },
  },
  models: {
    SourceConfig: {
      pk: { type: String, value: "SOURCE#${id}" },
      sk: { type: String, value: "CONFIG" },
      id: { type: String, required: true },
      title: { type: String, required: true },
      documentType: { type: String, required: true },
      topicDomains: { type: Array, items: { type: String } },
      url: { type: String, required: true },
      format: {
        type: String,
        required: true,
        enum: ["pdf", "html", "text"] as const,
      },
      ngbId: { type: String }, // omitted when null for sparse GSI
      priority: {
        type: String,
        required: true,
        enum: ["high", "medium", "low"] as const,
      },
      description: { type: String, required: true },
      authorityLevel: { type: String, required: true },
      enabled: { type: String, required: true }, // "true"/"false" string for GSI
      lastIngestedAt: { type: String },
      lastContentHash: { type: String },
      consecutiveFailures: { type: Number, default: 0 },
      lastError: { type: String },
      s3Key: { type: String },
      s3VersionId: { type: String },
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    SportOrganization: {
      pk: { type: String, value: "SPORTORG#${id}" },
      sk: { type: String, value: "PROFILE" },
      id: { type: String, required: true },
      type: {
        type: String,
        required: true,
        enum: ["ngb", "usopc_managed"] as const,
      },
      officialName: { type: String, required: true },
      abbreviation: { type: String },
      sports: { type: Array, items: { type: String } },
      olympicProgram: { type: String }, // null -> omitted for sparse
      paralympicManaged: { type: Boolean, default: false },
      websiteUrl: { type: String, required: true },
      bylawsUrl: { type: String },
      selectionProceduresUrl: { type: String },
      internationalFederation: { type: String },
      aliases: { type: Array, items: { type: String }, default: [] },
      keywords: { type: Array, items: { type: String }, default: [] },
      status: {
        type: String,
        required: true,
        enum: ["active", "decertified"] as const,
      },
      effectiveDate: { type: String, required: true },
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    AgentModel: {
      pk: { type: String, value: "AGENT#${id}" },
      sk: { type: String, value: "CONFIG" },
      id: { type: String, required: true },
      role: { type: String, required: true },
      model: { type: String, required: true },
      temperature: { type: Number },
      maxTokens: { type: Number },
      dimensions: { type: Number },
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    IngestionLog: {
      pk: { type: String, value: "SOURCE#${sourceId}" },
      sk: { type: String, value: "INGEST#${startedAt}" },
      gsi1pk: { type: String, value: "INGEST" },
      gsi1sk: { type: String, value: "${startedAt}" },
      sourceId: { type: String, required: true },
      sourceUrl: { type: String },
      status: {
        type: String,
        required: true,
        enum: ["pending", "in_progress", "completed", "failed"] as const,
      },
      contentHash: { type: String },
      chunksCount: { type: Number },
      errorMessage: { type: String },
      startedAt: { type: String, required: true },
      completedAt: { type: String },
      createdAt: { type: String },
    },
    Prompt: {
      pk: { type: String, value: "PROMPT#${name}" },
      sk: { type: String, value: "CONFIG" },
      name: { type: String, required: true },
      content: { type: String, required: true },
      domain: { type: String },
      version: { type: Number, default: 1 },
      updatedAt: { type: String },
      createdAt: { type: String },
    },
  },
  params: {
    timestamps: false,
    nulls: false,
    isoDates: false,
  },
} as const;
