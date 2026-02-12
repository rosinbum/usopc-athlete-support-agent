export {
  type LogLevel,
  type LogContext,
  type Logger,
  createLogger,
  logger,
} from "./logger.js";

export {
  CircuitBreaker,
  CircuitBreakerError,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerState,
} from "./circuitBreaker.js";

export {
  AppError,
  NotFoundError,
  ValidationError,
  AuthenticationError,
  RateLimitError,
  ExternalServiceError,
  IngestionError,
} from "./errors.js";

export {
  getRequiredEnv,
  getOptionalEnv,
  getDatabaseUrl,
  getSecretValue,
  getOptionalSecretValue,
  isProduction,
  isDevelopment,
} from "./env.js";

export { getPool, closePool } from "./pool.js";

export {
  deleteChunksBySourceId,
  updateChunkMetadataBySourceId,
  countChunksBySourceId,
  type ChunkMetadataUpdates,
} from "./chunks.js";

export {
  paginationSchema,
  type Pagination,
  uuidSchema,
  type Uuid,
  sportOrgIdSchema,
  type SportOrgId,
  TOPIC_DOMAINS,
  topicDomainSchema,
  type TopicDomain,
  CHANNELS,
  channelSchema,
  type Channel,
  AUTHORITY_LEVELS,
  authorityLevelSchema,
  type AuthorityLevel,
  DOCUMENT_TYPES,
  documentTypeSchema,
  type DocumentType,
} from "./validation.js";

export { AppTableSchema } from "./entities/index.js";
export { createAppTable } from "./entities/index.js";
export {
  SourceConfigEntity,
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
} from "./entities/index.js";
export { SportOrgEntity } from "./entities/index.js";
export { AgentModelEntity, type AgentModelConfig } from "./entities/index.js";
export { IngestionLogEntity, type IngestionLog } from "./entities/index.js";
export { PromptEntity, type PromptConfig } from "./entities/index.js";
export type {
  OlympicProgram,
  OrgStatus,
  OrgType,
  SportOrganization,
} from "./types/sport-org.js";
