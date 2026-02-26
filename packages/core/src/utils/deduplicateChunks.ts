import { AUTHORITY_LEVELS, type AuthorityLevel } from "@usopc/shared";
import type { RetrievedDocument, AlternativeSource } from "../types/index.js";

/**
 * Extracts character trigrams from normalized text.
 */
export function trigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  const result = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    result.add(normalized.slice(i, i + 3));
  }
  return result;
}

/**
 * Computes Jaccard similarity between two trigram sets.
 * Returns 0 for empty sets to avoid division by zero.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  const smaller = a.size <= b.size ? a : b;
  const larger = a.size <= b.size ? b : a;
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Returns the authority index for sorting (lower index = higher authority).
 * Returns Infinity for unknown/undefined levels so they sort last.
 */
function authorityIndex(level: AuthorityLevel | undefined): number {
  if (!level) return Infinity;
  const idx = AUTHORITY_LEVELS.indexOf(level);
  return idx === -1 ? Infinity : idx;
}

/**
 * Union-Find with path compression and union by rank.
 */
class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]!);
    }
    return this.parent[x]!;
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    if (this.rank[rx]! < this.rank[ry]!) {
      this.parent[rx] = ry;
    } else if (this.rank[rx]! > this.rank[ry]!) {
      this.parent[ry] = rx;
    } else {
      this.parent[ry] = rx;
      this.rank[rx]!++;
    }
  }
}

/**
 * Deduplicates near-duplicate document chunks using trigram Jaccard similarity.
 *
 * Groups transitively similar documents via Union-Find. For each cluster,
 * selects the representative with (1) highest authority level, (2) highest
 * score as tiebreaker. Sibling metadata is preserved in `alternativeSources`.
 *
 * @param docs - Retrieved documents sorted by score descending
 * @param threshold - Jaccard similarity threshold (default 0.85)
 * @returns Deduplicated documents sorted by score descending
 */
export function deduplicateChunks(
  docs: RetrievedDocument[],
  threshold = 0.85,
): RetrievedDocument[] {
  if (docs.length <= 1) return docs;

  // Pre-compute trigram sets
  const trigramSets = docs.map((doc) => trigrams(doc.content));

  // Union-Find: merge pairs above threshold
  const uf = new UnionFind(docs.length);
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      if (jaccardSimilarity(trigramSets[i]!, trigramSets[j]!) >= threshold) {
        uf.union(i, j);
      }
    }
  }

  // Group by cluster root
  const clusters = new Map<number, number[]>();
  for (let i = 0; i < docs.length; i++) {
    const root = uf.find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(i);
  }

  // Select representative per cluster
  const result: RetrievedDocument[] = [];
  for (const indices of clusters.values()) {
    // Sort: lowest authority index first, then highest score
    indices.sort((a, b) => {
      const authDiff =
        authorityIndex(docs[a]!.metadata.authorityLevel) -
        authorityIndex(docs[b]!.metadata.authorityLevel);
      if (authDiff !== 0) return authDiff;
      return docs[b]!.score - docs[a]!.score;
    });

    const repIdx = indices[0]!;
    const rep = docs[repIdx]!;

    // Build alternativeSources from siblings
    const altSources: AlternativeSource[] = [];
    for (let i = 1; i < indices.length; i++) {
      const sibling = docs[indices[i]!]!;
      altSources.push({
        documentTitle: sibling.metadata.documentTitle,
        sectionTitle: sibling.metadata.sectionTitle,
        sourceUrl: sibling.metadata.sourceUrl,
        authorityLevel: sibling.metadata.authorityLevel,
        score: sibling.score,
      });
    }

    const dedupDoc: RetrievedDocument = {
      content: rep.content,
      metadata: {
        ...rep.metadata,
        ...(altSources.length > 0 ? { alternativeSources: altSources } : {}),
      },
      score: rep.score,
    };

    result.push(dedupDoc);
  }

  // Re-sort by score descending
  result.sort((a, b) => b.score - a.score);

  return result;
}
