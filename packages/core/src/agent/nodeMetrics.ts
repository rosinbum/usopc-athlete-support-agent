import type { RunnableConfig } from "@langchain/core/runnables";
import type { AgentState } from "./state.js";

export interface NodeMetricEntry {
  name: string;
  durationMs: number;
  error?: string | undefined;
  timestamp: number;
}

/**
 * Lightweight in-memory metrics collector for graph node executions.
 * Records call count, duration, and errors per node.
 */
export class NodeMetricsCollector {
  private entries: NodeMetricEntry[] = [];

  record(name: string, durationMs: number, error?: string): void {
    this.entries.push({
      name,
      durationMs,
      error,
      timestamp: Date.now(),
    });
  }

  getAll(): NodeMetricEntry[] {
    return [...this.entries];
  }

  reset(): void {
    this.entries = [];
  }
}

/** Singleton metrics collector for the agent graph. */
export const nodeMetrics = new NodeMetricsCollector();

/**
 * Extract the request-scoped metrics collector from RunnableConfig,
 * falling back to the global singleton for backward compatibility.
 */
export function getMetricsCollector(
  config?: RunnableConfig,
): NodeMetricsCollector {
  const configurable = config?.configurable as
    | Record<string, unknown>
    | undefined;
  if (configurable?.nodeMetrics instanceof NodeMetricsCollector) {
    return configurable.nodeMetrics;
  }
  return nodeMetrics;
}

/**
 * Higher-order function that wraps a graph node with timing metrics.
 *
 * Uses a request-scoped collector from `config.configurable.nodeMetrics`
 * when available, falling back to the global singleton.
 *
 * Since nodes catch their own errors (they never throw), the error
 * field is only populated if the node unexpectedly throws.
 */
export function withMetrics(
  nodeName: string,
  fn: (
    state: AgentState,
    config?: RunnableConfig,
  ) => Promise<Partial<AgentState>>,
): (
  state: AgentState,
  config?: RunnableConfig,
) => Promise<Partial<AgentState>> {
  return async (
    state: AgentState,
    config?: RunnableConfig,
  ): Promise<Partial<AgentState>> => {
    const collector = getMetricsCollector(config);
    const start = Date.now();
    try {
      const result = await fn(state, config);
      collector.record(nodeName, Date.now() - start);
      return result;
    } catch (error) {
      collector.record(
        nodeName,
        Date.now() - start,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  };
}
