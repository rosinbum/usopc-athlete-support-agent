import { ChatAnthropic } from "@langchain/anthropic";
import { getModelConfig } from "./models.js";

export interface AgentModels {
  /** Sonnet instance for synthesizer, escalate, and other heavy-reasoning nodes. */
  agentModel: ChatAnthropic;
  /** Haiku instance for classifier, qualityChecker, queryPlanner, retrievalExpander, and conversationMemory. */
  classifierModel: ChatAnthropic;
}

/**
 * Creates the shared ChatAnthropic instances used by all graph nodes.
 *
 * Call once at startup (AgentRunner.create, studio.ts, eval setup) and pass
 * the returned models into `createAgentGraph` and `initConversationMemoryModel`.
 * This eliminates redundant model construction across entry points.
 */
export async function createAgentModels(): Promise<AgentModels> {
  const config = await getModelConfig();
  const agentModel = new ChatAnthropic({
    model: config.agent.model,
    temperature: config.agent.temperature,
    maxTokens: config.agent.maxTokens,
  });
  const classifierModel = new ChatAnthropic({
    model: config.classifier.model,
    temperature: config.classifier.temperature,
    maxTokens: config.classifier.maxTokens,
  });
  return { agentModel, classifierModel };
}
