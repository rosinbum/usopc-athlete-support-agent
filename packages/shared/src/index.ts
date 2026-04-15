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
export type { ApiError } from "./errors.js";

export {
  getRequiredEnv,
  getOptionalEnv,
  getDatabaseUrl,
  getSecretValue,
  getOptionalSecretValue,
  isProduction,
  isDevelopment,
  parseEnvInt,
  parseEnvFloat,
} from "./env.js";

export { getPool, closePool, getPoolStatus, type PoolStatus } from "./pool.js";

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
  PRIORITY_LEVELS,
  priorityLevelSchema,
  type PriorityLevel,
  FORMATS,
  formatSchema,
  type Format,
} from "./validation.js";

// Entity factory functions
export {
  createSourceConfigEntity,
  createIngestionLogEntity,
  createDiscoveredSourceEntity,
  createInviteEntity,
  createFeedbackEntity,
  createAccessRequestEntity,
  createDiscoveryRunEntity,
} from "./entities/index.js";

// Entity types
export {
  type SourceConfig,
  type CreateSourceInput,
  type MarkSuccessOptions,
} from "./entities/index.js";
export {
  REPROCESSABLE_STATUSES,
  type DiscoveredSource,
  type CreateDiscoveredSourceInput,
  type DiscoveryMethod,
  type DiscoveryStatus,
} from "./entities/index.js";
export { type AgentModelConfig } from "./entities/index.js";
export { type IngestionLog } from "./entities/index.js";
export { type PromptConfig } from "./entities/index.js";
export { type Invite, type CreateInviteInput } from "./entities/index.js";
export { type Feedback, type CreateFeedbackInput } from "./entities/index.js";
export {
  type AccessRequest,
  type AccessRequestStatus,
  type CreateAccessRequestInput,
} from "./entities/index.js";
export { type DiscoveryRun } from "./entities/index.js";

// PG entity classes (for direct construction)
export {
  SourceConfigEntityPg,
  DiscoveredSourceEntityPg,
  IngestionLogEntityPg,
  InviteEntityPg,
  FeedbackEntityPg,
  AccessRequestEntityPg,
  DiscoveryRunEntityPg,
  AgentModelEntityPg,
  PromptEntityPg,
  SportOrgEntityPg,
} from "./entities/index.js";

// Backward-compatible type aliases (old class names → PG classes)
export type {
  SourceConfigEntityPg as SourceConfigEntity,
  DiscoveredSourceEntityPg as DiscoveredSourceEntity,
  IngestionLogEntityPg as IngestionLogEntity,
  InviteEntityPg as InviteEntity,
  FeedbackEntityPg as FeedbackEntity,
  AccessRequestEntityPg as AccessRequestEntity,
  DiscoveryRunEntityPg as DiscoveryRunEntity,
  AgentModelEntityPg as AgentModelEntity,
  PromptEntityPg as PromptEntity,
  SportOrgEntityPg as SportOrgEntity,
} from "./entities/index.js";
export type {
  OlympicProgram,
  OrgStatus,
  OrgType,
  SportOrganization,
} from "./types/sport-org.js";

export { NGB_IDS, NGB_ID_SET, type NgbId } from "./ngbIds.js";

export { normalizeUrl, urlToId } from "./url.js";

export { getResource } from "./resources.js";

export { ParamBuilder } from "./paramBuilder.js";

export {
  createStorageService,
  GCSStorageService,
  type StorageService,
  type StoreDocumentResult,
} from "./storage/index.js";

export {
  createQueueService,
  PubSubQueueService,
  type QueueService,
} from "./queue/index.js";

export {
  sendDiscoveryToSources,
  type SendToSourcesResult,
  type SendToSourcesOptions,
} from "./services/discoveryPromotion.js";
