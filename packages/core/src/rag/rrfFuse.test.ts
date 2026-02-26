import { describe, it, expect } from "vitest";
import { rrfFuse, type VectorInput, type TextInput } from "./rrfFuse.js";

function makeVector(
  id: string,
  score: number,
  content = `vector-${id}`,
): VectorInput {
  return { id, content, metadata: { source: "vector" }, score };
}

function makeText(
  id: string,
  textRank: number,
  content = `text-${id}`,
): TextInput {
  return { id, content, metadata: { source: "text" }, textRank };
}

describe("rrfFuse", () => {
  it("fuses results appearing in both lists (higher score than single-list)", () => {
    const vector = [makeVector("a", 0.1, "doc-a"), makeVector("b", 0.2)];
    const text = [makeText("a", 0.9, "doc-a"), makeText("c", 0.5)];

    const fused = rrfFuse(vector, text);

    const docA = fused.find((c) => c.id === "a")!;
    const docB = fused.find((c) => c.id === "b")!;
    const docC = fused.find((c) => c.id === "c")!;

    // doc-a appears in both lists so should score higher than single-list docs
    expect(docA.score).toBeGreaterThan(docB.score);
    expect(docA.score).toBeGreaterThan(docC.score);
    expect(docA.vectorRank).toBe(1);
    expect(docA.textRank).toBe(1);
  });

  it("handles vector-only results (no text matches)", () => {
    const vector = [makeVector("a", 0.1), makeVector("b", 0.2)];
    const text: TextInput[] = [];

    const fused = rrfFuse(vector, text);

    expect(fused).toHaveLength(2);
    expect(fused[0]!.id).toBe("a");
    expect(fused[0]!.vectorRank).toBe(1);
    expect(fused[0]!.textRank).toBeNull();
    expect(fused[0]!.score).toBeGreaterThan(0);
  });

  it("handles text-only results (no vector matches)", () => {
    const vector: VectorInput[] = [];
    const text = [makeText("x", 0.9), makeText("y", 0.5)];

    const fused = rrfFuse(vector, text);

    expect(fused).toHaveLength(2);
    expect(fused[0]!.id).toBe("x");
    expect(fused[0]!.vectorRank).toBeNull();
    expect(fused[0]!.textRank).toBe(1);
  });

  it("deduplicates by id", () => {
    const vector = [makeVector("a", 0.1, "doc-a")];
    const text = [makeText("a", 0.9, "doc-a")];

    const fused = rrfFuse(vector, text);

    expect(fused).toHaveLength(1);
    expect(fused[0]!.id).toBe("a");
  });

  it("respects k limit", () => {
    const vector = Array.from({ length: 20 }, (_, i) =>
      makeVector(`v${i}`, i * 0.1),
    );
    const text: TextInput[] = [];

    const fused = rrfFuse(vector, text, { k: 5 });

    expect(fused).toHaveLength(5);
  });

  it("empty inputs return empty output", () => {
    const fused = rrfFuse([], []);
    expect(fused).toEqual([]);
  });

  it("with high vectorWeight, vector-only results rank higher than text-only", () => {
    const vector = [makeVector("v1", 0.1)];
    const text = [makeText("t1", 0.9)];

    const fused = rrfFuse(vector, text, { vectorWeight: 0.9 });

    // vector-only doc should rank first because alpha=0.9 gives much more
    // weight to vector signal
    expect(fused[0]!.id).toBe("v1");
    expect(fused[1]!.id).toBe("t1");
  });

  it("with low vectorWeight, text-only results rank higher than vector-only", () => {
    const vector = [makeVector("v1", 0.1)];
    const text = [makeText("t1", 0.9)];

    const fused = rrfFuse(vector, text, { vectorWeight: 0.1 });

    // text-only doc should rank first because alpha=0.1 gives much more
    // weight to text signal
    expect(fused[0]!.id).toBe("t1");
    expect(fused[1]!.id).toBe("v1");
  });

  it("uses content from vector result when doc appears in both lists", () => {
    const vector = [makeVector("a", 0.1, "vector content")];
    const text = [makeText("a", 0.9, "text content")];

    const fused = rrfFuse(vector, text);

    // Vector results are processed first, so vector content is used
    expect(fused[0]!.content).toBe("vector content");
  });

  it("defaults rrfK to 60", () => {
    const vector = [makeVector("a", 0.1)];
    const fused = rrfFuse(vector, [], { vectorWeight: 1.0 });

    // With vectorWeight=1 and rank=1: score = 1/(60+1) = 1/61
    expect(fused[0]!.score).toBeCloseTo(1 / 61, 10);
  });

  it("custom rrfK changes scores", () => {
    const vector = [makeVector("a", 0.1)];
    const fused = rrfFuse(vector, [], { vectorWeight: 1.0, rrfK: 10 });

    // With vectorWeight=1, rrfK=10, rank=1: score = 1/(10+1) = 1/11
    expect(fused[0]!.score).toBeCloseTo(1 / 11, 10);
  });
});
