import { describe, it, expect, vi, beforeEach } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import {
  NodeMetricsCollector,
  nodeMetrics,
  withMetrics,
  getMetricsCollector,
} from "./nodeMetrics.js";
import { makeDefaultState, type AgentState } from "./state.js";

function makeState(overrides: Partial<AgentState> = {}): AgentState {
  return makeDefaultState(overrides);
}

describe("NodeMetricsCollector", () => {
  let collector: NodeMetricsCollector;

  beforeEach(() => {
    collector = new NodeMetricsCollector();
  });

  it("records a metric entry", () => {
    collector.record("classifier", 42);

    const entries = collector.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("classifier");
    expect(entries[0]!.durationMs).toBe(42);
    expect(entries[0]!.error).toBeUndefined();
    expect(entries[0]!.timestamp).toBeGreaterThan(0);
  });

  it("records a metric entry with error", () => {
    collector.record("synthesizer", 100, "timeout");

    const entries = collector.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.error).toBe("timeout");
  });

  it("accumulates multiple entries", () => {
    collector.record("classifier", 10);
    collector.record("retriever", 50);
    collector.record("synthesizer", 200);

    expect(collector.getAll()).toHaveLength(3);
  });

  it("returns a copy from getAll", () => {
    collector.record("classifier", 10);
    const entries = collector.getAll();
    entries.push({ name: "fake", durationMs: 0, timestamp: 0 });

    expect(collector.getAll()).toHaveLength(1);
  });

  it("clears entries on reset", () => {
    collector.record("classifier", 10);
    collector.record("retriever", 50);
    collector.reset();

    expect(collector.getAll()).toHaveLength(0);
  });
});

describe("nodeMetrics singleton", () => {
  beforeEach(() => {
    nodeMetrics.reset();
  });

  it("is a NodeMetricsCollector instance", () => {
    expect(nodeMetrics).toBeInstanceOf(NodeMetricsCollector);
  });
});

describe("getMetricsCollector", () => {
  it("returns the global singleton when no config is provided", () => {
    expect(getMetricsCollector()).toBe(nodeMetrics);
  });

  it("returns the global singleton when config has no nodeMetrics", () => {
    expect(getMetricsCollector({ configurable: { thread_id: "t1" } })).toBe(
      nodeMetrics,
    );
  });

  it("returns request-scoped collector from config.configurable", () => {
    const scoped = new NodeMetricsCollector();
    const config = { configurable: { thread_id: "t1", nodeMetrics: scoped } };
    expect(getMetricsCollector(config)).toBe(scoped);
  });
});

describe("withMetrics", () => {
  beforeEach(() => {
    nodeMetrics.reset();
  });

  it("records duration for a successful node", async () => {
    const node = vi.fn().mockResolvedValue({ answer: "test" });
    const wrapped = withMetrics("synthesizer", node);

    const result = await wrapped(makeState());

    expect(result).toEqual({ answer: "test" });
    const entries = nodeMetrics.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("synthesizer");
    expect(entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
    expect(entries[0]!.error).toBeUndefined();
  });

  it("records duration and error for a throwing node", async () => {
    const node = vi.fn().mockRejectedValue(new Error("node exploded"));
    const wrapped = withMetrics("classifier", node);

    await expect(wrapped(makeState())).rejects.toThrow("node exploded");

    const entries = nodeMetrics.getAll();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("classifier");
    expect(entries[0]!.error).toBe("node exploded");
  });

  it("passes state through to the wrapped function", async () => {
    const node = vi.fn().mockResolvedValue({});
    const wrapped = withMetrics("retriever", node);
    const state = makeState({ topicDomain: "safesport" });

    await wrapped(state);

    expect(node).toHaveBeenCalledWith(state, undefined);
  });

  it("uses request-scoped collector from config instead of global", async () => {
    const scoped = new NodeMetricsCollector();
    const node = vi.fn().mockResolvedValue({ answer: "scoped" });
    const wrapped = withMetrics("synthesizer", node);
    const config = { configurable: { thread_id: "t1", nodeMetrics: scoped } };

    await wrapped(makeState(), config);

    // Scoped collector should have the entry
    expect(scoped.getAll()).toHaveLength(1);
    expect(scoped.getAll()[0]!.name).toBe("synthesizer");

    // Global singleton should be untouched
    expect(nodeMetrics.getAll()).toHaveLength(0);
  });

  it("falls back to global when config has no nodeMetrics", async () => {
    const node = vi.fn().mockResolvedValue({});
    const wrapped = withMetrics("classifier", node);
    const config = { configurable: { thread_id: "t1" } };

    await wrapped(makeState(), config);

    expect(nodeMetrics.getAll()).toHaveLength(1);
    expect(nodeMetrics.getAll()[0]!.name).toBe("classifier");
  });
});
