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
      pk: { type: String, value: "Source#${id}" },
      sk: { type: String, value: "SourceConfig" },
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
      gsi1pk: { type: String, value: "SOURCE#ALL" },
      gsi1sk: { type: String, value: "${createdAt}" },
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    DiscoveredSource: {
      pk: { type: String, value: "Discovery#${id}" },
      sk: { type: String, value: "DiscoveredSource" },
      gsi1pk: { type: String, value: "Discovery#${status}" },
      gsi1sk: { type: String, value: "${discoveredAt}" },
      id: { type: String, required: true },
      url: { type: String, required: true },
      title: { type: String, required: true },
      // Discovery metadata
      discoveryMethod: {
        type: String,
        required: true,
        enum: ["map", "search", "manual", "agent"] as const,
      },
      discoveredAt: { type: String, required: true },
      discoveredFrom: { type: String },
      // Evaluation results
      status: {
        type: String,
        required: true,
        enum: [
          "pending_metadata",
          "pending_content",
          "approved",
          "rejected",
        ] as const,
      },
      metadataConfidence: { type: Number },
      contentConfidence: { type: Number },
      combinedConfidence: { type: Number },
      // Extracted metadata
      documentType: { type: String },
      topicDomains: { type: Array, items: { type: String } },
      format: {
        type: String,
        enum: ["pdf", "html", "text"] as const,
      },
      ngbId: { type: String },
      priority: {
        type: String,
        enum: ["high", "medium", "low"] as const,
      },
      description: { type: String },
      authorityLevel: { type: String },
      // LLM reasoning
      metadataReasoning: { type: String },
      contentReasoning: { type: String },
      // Review tracking
      reviewedAt: { type: String },
      reviewedBy: { type: String },
      rejectionReason: { type: String },
      sourceConfigId: { type: String }, // if approved and created
      createdAt: { type: String },
      updatedAt: { type: String },
    },
    SportOrganization: {
      pk: { type: String, value: "SportOrg#${id}" },
      sk: { type: String, value: "Profile" },
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
      pk: { type: String, value: "Agent#${id}" },
      sk: { type: String, value: "AgentModel" },
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
      pk: { type: String, value: "Source#${sourceId}" },
      sk: { type: String, value: "Ingest#${startedAt}" },
      gsi1pk: { type: String, value: "Ingest" },
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
      pk: { type: String, value: "Prompt#${name}" },
      sk: { type: String, value: "Prompt" },
      name: { type: String, required: true },
      content: { type: String, required: true },
      domain: { type: String },
      version: { type: Number, default: 1 },
      updatedAt: { type: String },
      createdAt: { type: String },
    },
    UsageMetric: {
      pk: { type: String, value: "Usage#${service}" },
      sk: { type: String, value: "${period}#${date}" }, // e.g., "daily#2026-02-15"
      gsi1pk: { type: String, value: "Usage" },
      gsi1sk: { type: String, value: "${date}" },
      service: {
        type: String,
        required: true,
        enum: ["tavily", "anthropic"] as const,
      },
      period: {
        type: String,
        required: true,
        enum: ["daily", "weekly", "monthly"] as const,
      },
      date: { type: String, required: true }, // ISO date (YYYY-MM-DD)
      // Tavily metrics
      tavilyCalls: { type: Number, default: 0 },
      tavilyCredits: { type: Number, default: 0 },
      // Anthropic metrics
      anthropicCalls: { type: Number, default: 0 },
      anthropicInputTokens: { type: Number, default: 0 },
      anthropicOutputTokens: { type: Number, default: 0 },
      anthropicCost: { type: Number, default: 0 }, // in dollars
      createdAt: { type: String },
      updatedAt: { type: String },
    },
  },
  params: {
    timestamps: false,
    nulls: false,
    isoDates: false,
  },
} as const;
