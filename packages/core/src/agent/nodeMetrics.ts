import type { AgentState } from "./state.js";

export interface NodeMetricEntry {
  name: string;
  durationMs: number;
  error?: string;
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
 * Higher-order function that wraps a graph node with timing metrics.
 *
 * Since nodes catch their own errors (they never throw), the error
 * field is only populated if the node unexpectedly throws.
 */
export function withMetrics(
  nodeName: string,
  fn: (state: AgentState) => Promise<Partial<AgentState>>,
): (state: AgentState) => Promise<Partial<AgentState>> {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const start = Date.now();
    try {
      const result = await fn(state);
      nodeMetrics.record(nodeName, Date.now() - start);
      return result;
    } catch (error) {
      nodeMetrics.record(
        nodeName,
        Date.now() - start,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  };
}
