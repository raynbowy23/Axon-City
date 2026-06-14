/**
 * City DNA corpus normalization + similarity (novelty track N2).
 *
 * Replaces the hand-tuned fixed scales with **percentile-against-corpus**: each
 * raw dimension is mapped to where it falls in the distribution of the ~36
 * reference neighborhoods (src/data/dnaCorpus.json). This is the principled
 * normalization the fixed `DNA_SCALES` were a placeholder for, and the same
 * corpus powers the "most similar neighborhood" similarity hook.
 *
 * Kept separate from cityDna.ts so the corpus build script (which imports
 * cityDna for raw extraction) never needs the corpus JSON to exist.
 */

import corpus from '../data/dnaCorpus.json';
import { DNA_DIMENSIONS, type DnaNormalizer } from './cityDna';

export interface CorpusEntry {
  name: string;
  city: string;
  country: string;
  bbox: [number, number, number, number];
  raw: number[];
}

const DIM = DNA_DIMENSIONS.length;
export const CORPUS: CorpusEntry[] = (corpus.neighborhoods ?? []) as CorpusEntry[];
export const corpusCount = CORPUS.length;
/** Below this, percentile ranks are too noisy — callers fall back to fixed scales. */
export const corpusReady = corpusCount >= 10;

// Per-dimension sorted raw values, for percentile lookup.
const sortedByDim: number[][] = DNA_DIMENSIONS.map((_, i) =>
  CORPUS.map((e) => e.raw[i] ?? 0).sort((a, b) => a - b)
);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fraction of corpus values ≤ v (0–1) — the percentile rank of v. */
function percentileRank(sorted: number[], v: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  // upper-bound binary search → count of values ≤ v
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] <= v) lo = mid + 1;
    else hi = mid;
  }
  return clamp01(lo / n);
}

/** Normalize a raw DNA vector to 0–1 by percentile against the corpus. */
export const normalizeDnaPercentile: DnaNormalizer = (raw) =>
  raw.map((v, i) => percentileRank(sortedByDim[i], v));

// Corpus entries pre-normalized once, for similarity.
const normalizedCorpus = CORPUS.map((e) => normalizeDnaPercentile(e.raw));

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < DIM; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SimilarityMatch {
  entry: CorpusEntry;
  similarity: number; // 0–1
}

/**
 * Most similar corpus neighborhoods to a normalized (0–1) DNA vector, by cosine
 * similarity. Pass the percentile-normalized vector so both sides are on the
 * same footing.
 */
export function mostSimilar(normalizedVector: number[], k = 3): SimilarityMatch[] {
  return normalizedCorpus
    .map((vec, i) => ({ entry: CORPUS[i], similarity: cosineSimilarity(normalizedVector, vec) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
