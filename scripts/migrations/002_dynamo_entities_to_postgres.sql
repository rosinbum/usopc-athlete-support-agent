-- Migration: Consolidate DynamoDB entities into PostgreSQL
-- This replaces the AppTable (OneTable) and AuthTable DynamoDB tables.

BEGIN;

-- ============================================================================
-- Source Configs
-- ============================================================================
CREATE TABLE IF NOT EXISTS source_configs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  document_type TEXT NOT NULL,
  topic_domains TEXT[] NOT NULL DEFAULT '{}',
  url TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'html', 'text')),
  ngb_id TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  description TEXT NOT NULL,
  authority_level TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_ingested_at TIMESTAMPTZ,
  last_content_hash TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  storage_key TEXT,
  storage_version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_source_configs_ngb_id ON source_configs (ngb_id) WHERE ngb_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_source_configs_enabled ON source_configs (enabled, priority);
CREATE INDEX IF NOT EXISTS idx_source_configs_created_at ON source_configs (created_at);

-- ============================================================================
-- Discovered Sources
-- ============================================================================
CREATE TABLE IF NOT EXISTS discovered_sources (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  discovery_method TEXT NOT NULL CHECK (discovery_method IN ('map', 'search', 'manual', 'agent')),
  discovered_at TIMESTAMPTZ NOT NULL,
  discovered_from TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending_metadata', 'pending_content', 'approved', 'rejected')),
  metadata_confidence DOUBLE PRECISION,
  content_confidence DOUBLE PRECISION,
  combined_confidence DOUBLE PRECISION,
  document_type TEXT,
  topic_domains TEXT[] NOT NULL DEFAULT '{}',
  format TEXT CHECK (format IS NULL OR format IN ('pdf', 'html', 'text')),
  ngb_id TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low')),
  description TEXT,
  authority_level TEXT,
  metadata_reasoning TEXT,
  content_reasoning TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  rejection_reason TEXT,
  source_config_id TEXT REFERENCES source_configs(id),
  last_error TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discovered_sources_status ON discovered_sources (status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovered_sources_discovered_at ON discovered_sources (discovered_at DESC);

-- ============================================================================
-- Sport Organizations
-- ============================================================================
CREATE TABLE IF NOT EXISTS sport_organizations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ngb', 'usopc_managed')),
  official_name TEXT NOT NULL,
  abbreviation TEXT,
  sports TEXT[] NOT NULL DEFAULT '{}',
  olympic_program TEXT CHECK (olympic_program IS NULL OR olympic_program IN ('summer', 'winter', 'pan_american')),
  paralympic_managed BOOLEAN NOT NULL DEFAULT false,
  website_url TEXT NOT NULL,
  bylaws_url TEXT,
  selection_procedures_url TEXT,
  international_federation TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('active', 'decertified')),
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sport_orgs_status ON sport_organizations (status);

-- ============================================================================
-- Agent Models (configuration for LLM providers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_models (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  temperature DOUBLE PRECISION,
  max_tokens INTEGER,
  provider TEXT,
  dimensions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Ingestion Logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingestion_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  content_hash TEXT,
  chunks_count INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_logs_source ON ingestion_logs (source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingestion_logs_started_at ON ingestion_logs (started_at DESC);

-- ============================================================================
-- Discovery Runs
-- ============================================================================
CREATE TABLE IF NOT EXISTS discovery_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  triggered_by TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  discovered INTEGER,
  enqueued INTEGER,
  skipped INTEGER,
  errors INTEGER,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_discovery_runs_started_at ON discovery_runs (started_at DESC);

-- ============================================================================
-- Prompts
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompts (
  name TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  domain TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Conversation-level Feedback (distinct from message-level feedback table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversation_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('slack', 'web')),
  score INTEGER NOT NULL,
  comment TEXT,
  message_id TEXT,
  user_id TEXT,
  run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_feedback_conversation ON conversation_feedback (conversation_id, created_at);

-- ============================================================================
-- Access Requests
-- ============================================================================
CREATE TABLE IF NOT EXISTS access_requests (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sport TEXT,
  role TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests (status, requested_at DESC);

-- ============================================================================
-- Invites
-- ============================================================================
CREATE TABLE IF NOT EXISTS invites (
  email TEXT PRIMARY KEY,
  invited_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Usage Metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS usage_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service TEXT NOT NULL CHECK (service IN ('tavily', 'anthropic')),
  period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
  date DATE NOT NULL,
  tavily_calls INTEGER NOT NULL DEFAULT 0,
  tavily_credits INTEGER NOT NULL DEFAULT 0,
  anthropic_calls INTEGER NOT NULL DEFAULT 0,
  anthropic_input_tokens INTEGER NOT NULL DEFAULT 0,
  anthropic_output_tokens INTEGER NOT NULL DEFAULT 0,
  anthropic_cost DOUBLE PRECISION NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (service, period, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_metrics_date ON usage_metrics (date DESC);

-- ============================================================================
-- Auth.js PostgreSQL adapter tables
-- See: https://authjs.dev/getting-started/adapters/pg
-- ============================================================================
-- @auth/pg-adapter expects these exact table names (no prefix)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  name TEXT,
  email TEXT UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
  "sessionToken" TEXT NOT NULL UNIQUE,
  "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

COMMIT;
