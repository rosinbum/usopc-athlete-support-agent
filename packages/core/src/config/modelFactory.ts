import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getModelConfig } from "./models.js";

export interface AgentModels {
  /** Model instance for synthesizer, escalate, and other heavy-reasoning nodes. */
  agentModel: BaseChatModel;
  /** Model instance for classifier, qualityChecker, queryPlanner, retrievalExpander, and conversationMemory. */
  classifierModel: BaseChatModel;
}

/**
 * Creates a chat model instance based on the provider in the config.
 *
 * Supports "anthropic" (default), "openai", and "google" providers.
 * Only this function (and this file) imports concrete provider classes.
 */
export function createChatModel(config: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  provider?: string;
}): BaseChatModel {
  const opts: Record<string, unknown> = { model: config.model };
  if (config.temperature !== undefined) opts.temperature = config.temperature;

  switch (config.provider) {
    case "openai":
      if (config.maxTokens !== undefined) opts.maxTokens = config.maxTokens;
      return new ChatOpenAI(opts);
    case "google":
      return new ChatGoogleGenerativeAI({
        model: config.model,
        ...(config.temperature !== undefined && {
          temperature: config.temperature,
        }),
        ...(config.maxTokens !== undefined && {
          maxOutputTokens: config.maxTokens,
        }),
      });
    case "anthropic":
    default:
      if (config.maxTokens !== undefined) opts.maxTokens = config.maxTokens;
      return new ChatAnthropic(opts);
  }
}

/**
 * Creates the shared model instances used by all graph nodes.
 *
 * Call once at startup (AgentRunner.create, studio.ts, eval setup) and pass
 * the returned models into `createAgentGraph`. The classifierModel can also
 * be passed to `generateSummary()` for conversation memory.
 * This eliminates redundant model construction across entry points.
 */
export async function createAgentModels(): Promise<AgentModels> {
  const config = await getModelConfig();
  const agentModel = createChatModel(config.agent);
  const classifierModel = createChatModel(config.classifier);
  return { agentModel, classifierModel };
}
