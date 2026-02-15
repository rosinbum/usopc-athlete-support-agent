import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { createLogger } from "@usopc/shared";
import { z } from "zod";
import {
  buildMetadataEvaluationPrompt,
  buildContentEvaluationPrompt,
} from "../prompts/sourceEvaluation.js";
import { generateContextHint } from "./contextHints.js";

const logger = createLogger({ service: "evaluation-service" });

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const MetadataEvaluationSchema = z.object({
  isRelevant: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  suggestedTopicDomains: z.array(z.string()),
  preliminaryDocumentType: z.string(),
});

const ContentEvaluationSchema = z.object({
  isHighQuality: z.boolean(),
  confidence: z.number().min(0).max(1),
  documentType: z.string(),
  topicDomains: z.array(z.string()),
  authorityLevel: z.enum([
    "law",
    "usopc_governance",
    "ngb_policy_procedure",
    "educational_guidance",
  ]),
  priority: z.enum(["high", "medium", "low"]),
  description: z.string(),
  keyTopics: z.array(z.string()),
  ngbId: z.string().nullable(),
});

export type MetadataEvaluation = z.infer<typeof MetadataEvaluationSchema>;
export type ContentEvaluation = z.infer<typeof ContentEvaluationSchema>;

// ---------------------------------------------------------------------------
// EvaluationService
// ---------------------------------------------------------------------------

export interface EvaluationConfig {
  anthropicApiKey: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Service for evaluating discovered sources using LLMs.
 *
 * Features:
 * - Metadata evaluation (fast pre-filter)
 * - Content evaluation (deep analysis)
 * - Robust JSON parsing with graceful degradation
 * - Confidence scoring
 */
export class EvaluationService {
  private model: ChatAnthropic;

  constructor(config: EvaluationConfig) {
    this.model = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: config.model ?? "claude-haiku-4-5-20251001",
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens ?? 1024,
    });
  }

  /**
   * Evaluate a discovered source based on metadata (URL, title, domain).
   * This is a fast pre-filter before content extraction.
   *
   * @param url - The discovered URL
   * @param title - The page title
   * @param domain - The base domain
   * @returns Metadata evaluation result
   */
  async evaluateMetadata(
    url: string,
    title: string,
    domain: string,
  ): Promise<MetadataEvaluation> {
    const contextHint = generateContextHint(url);
    const prompt = buildMetadataEvaluationPrompt(
      url,
      title,
      domain,
      contextHint,
    );

    logger.info("Evaluating metadata", {
      url,
      domain,
      hasHints: !!contextHint,
    });

    try {
      const response = await this.model.invoke([new HumanMessage(prompt)]);
      const rawContent =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const parsed = this.parseMetadataResponse(rawContent);
      logger.info("Metadata evaluation complete", {
        url,
        isRelevant: parsed.isRelevant,
        confidence: parsed.confidence,
      });

      return parsed;
    } catch (error) {
      logger.error("Error evaluating metadata", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Evaluate a discovered source based on content.
   * This is a deep analysis after content extraction.
   *
   * @param url - The discovered URL
   * @param title - The page title
   * @param content - Extracted content (text)
   * @returns Content evaluation result
   */
  async evaluateContent(
    url: string,
    title: string,
    content: string,
  ): Promise<ContentEvaluation> {
    const contextHint = generateContextHint(url);
    const prompt = buildContentEvaluationPrompt(
      url,
      title,
      content,
      contextHint,
    );

    logger.info("Evaluating content", {
      url,
      contentLength: content.length,
      hasHints: !!contextHint,
    });

    try {
      const response = await this.model.invoke([new HumanMessage(prompt)]);
      const rawContent =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      const parsed = this.parseContentResponse(rawContent);
      logger.info("Content evaluation complete", {
        url,
        isHighQuality: parsed.isHighQuality,
        confidence: parsed.confidence,
        documentType: parsed.documentType,
      });

      return parsed;
    } catch (error) {
      logger.error("Error evaluating content", {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate combined confidence score.
   * Weighted average: 30% metadata + 70% content.
   *
   * @param metadataConfidence - Confidence from metadata evaluation
   * @param contentConfidence - Confidence from content evaluation
   * @returns Combined confidence score (0-1)
   */
  calculateCombinedConfidence(
    metadataConfidence: number,
    contentConfidence: number,
  ): number {
    return metadataConfidence * 0.3 + contentConfidence * 0.7;
  }

  /**
   * Parse metadata evaluation response from LLM.
   * Strips markdown code fences and validates with Zod.
   */
  private parseMetadataResponse(raw: string): MetadataEvaluation {
    try {
      // Strip any markdown code fences
      let cleaned = raw.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      return MetadataEvaluationSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn("Metadata evaluation failed Zod validation", {
          errors: error.errors,
        });
        // Graceful degradation: return safe default
        return {
          isRelevant: false,
          confidence: 0,
          reasoning: "Failed to parse LLM response",
          suggestedTopicDomains: [],
          preliminaryDocumentType: "Unknown",
        };
      }
      logger.error("Failed to parse metadata evaluation JSON", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Parse content evaluation response from LLM.
   * Strips markdown code fences and validates with Zod.
   */
  private parseContentResponse(raw: string): ContentEvaluation {
    try {
      // Strip any markdown code fences
      let cleaned = raw.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, "");
      }

      const parsed = JSON.parse(cleaned);
      return ContentEvaluationSchema.parse(parsed);
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn("Content evaluation failed Zod validation", {
          errors: error.errors,
        });
        // Graceful degradation: return safe default
        return {
          isHighQuality: false,
          confidence: 0,
          documentType: "Unknown",
          topicDomains: [],
          authorityLevel: "educational_guidance",
          priority: "low",
          description: "Failed to parse LLM response",
          keyTopics: [],
          ngbId: null,
        };
      }
      logger.error("Failed to parse content evaluation JSON", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
