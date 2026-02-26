/**
 * Reciprocal Rank Fusion (RRF) — merges ranked lists from vector and
 * full-text search into a single scored list.
 *
 * Pure function with no side effects.
 */

export interface RrfCandidate {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  /** Fused RRF score (higher = better). */
  score: number;
  /** 1-based rank in the vector results, or null if absent. */
  vectorRank: number | null;
  /** 1-based rank in the text results, or null if absent. */
  textRank: number | null;
}

export interface VectorInput {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  /** Cosine distance or similarity score from the vector store. */
  score: number;
}

export interface TextInput {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  /** ts_rank_cd score (higher = better). */
  textRank: number;
}

export interface RrfOptions {
  /** Number of results to return. @default 10 */
  k?: number;
  /** RRF smoothing constant. @default 60 */
  rrfK?: number;
  /** Weight for the vector signal (0-1). Text weight = 1 - vectorWeight. @default 0.5 */
  vectorWeight?: number;
}

/**
 * Fuses vector and text search results using weighted Reciprocal Rank Fusion.
 *
 * Formula per document:
 *   rrfScore = alpha * 1/(rrfK + vectorRank) + (1-alpha) * 1/(rrfK + textRank)
 *
 * Documents appearing in only one list get a single-sided score (the other
 * term is 0).
 */
export function rrfFuse(
  vectorResults: VectorInput[],
  textResults: TextInput[],
  options?: RrfOptions,
): RrfCandidate[] {
  const k = options?.k ?? 10;
  const rrfK = options?.rrfK ?? 60;
  const alpha = options?.vectorWeight ?? 0.5;

  // Build a map of id -> candidate data
  const candidates = new Map<
    string,
    {
      content: string;
      metadata: Record<string, unknown>;
      vectorRank: number | null;
      textRank: number | null;
    }
  >();

  // Assign vector ranks (1-based). Input is ordered by ascending cosine
  // distance (lower = better), so first item = rank 1.
  for (let i = 0; i < vectorResults.length; i++) {
    const v = vectorResults[i]!;
    candidates.set(v.id, {
      content: v.content,
      metadata: v.metadata,
      vectorRank: i + 1,
      textRank: null,
    });
  }

  // Assign text ranks (1-based). Input is ordered by descending ts_rank_cd
  // (highest = best), so first item = rank 1.
  for (let i = 0; i < textResults.length; i++) {
    const t = textResults[i]!;
    const existing = candidates.get(t.id);
    if (existing) {
      existing.textRank = i + 1;
    } else {
      candidates.set(t.id, {
        content: t.content,
        metadata: t.metadata,
        vectorRank: null,
        textRank: i + 1,
      });
    }
  }

  // Compute RRF score for each candidate
  const scored: RrfCandidate[] = [];
  for (const [id, c] of candidates) {
    const vectorTerm =
      c.vectorRank !== null ? alpha * (1 / (rrfK + c.vectorRank)) : 0;
    const textTerm =
      c.textRank !== null ? (1 - alpha) * (1 / (rrfK + c.textRank)) : 0;

    scored.push({
      id,
      content: c.content,
      metadata: c.metadata,
      score: vectorTerm + textTerm,
      vectorRank: c.vectorRank,
      textRank: c.textRank,
    });
  }

  // Sort by score descending, return top k
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
