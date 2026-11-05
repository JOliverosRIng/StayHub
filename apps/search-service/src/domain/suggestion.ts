import { SearchApplicationError } from "@search/application/errors/search-errors";

export type SuggestionType = "PROPERTY" | "LOCATION";

export interface SearchSuggestion {
  readonly text: string;
  readonly type: SuggestionType;
  readonly score: number;
}

export interface SuggestionItem {
  readonly text: string;
  readonly type: SuggestionType;
}

export interface SuggestionResponse {
  readonly items: readonly SuggestionItem[];
}

export interface SuggestionQuery {
  readonly q: string;
  readonly limit: number;
}

export interface SuggestionQueryInput {
  readonly q?: string;
  readonly limit?: number;
}

function invalid(field: string, code: string): SearchApplicationError {
  return new SearchApplicationError(
    "SEARCH_VALIDATION_FAILED",
    "Invalid suggestion query.",
    400,
    [{ field, code }],
  );
}

export function normalizeSuggestionText(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("es");
}

export function createSuggestionQuery(
  input: SuggestionQueryInput,
  limitMax = 20,
): SuggestionQuery {
  const q = normalizeSuggestionText(input.q ?? "");
  const limit = input.limit ?? 10;
  if (q.length < 1 || q.length > 120)
    throw invalid("q", "RANGE_1_120");
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > Math.min(limitMax, 20)
  )
    throw invalid("limit", "RANGE_1_20");
  return Object.freeze({ q, limit });
}

export function publicSuggestions(
  candidates: readonly SearchSuggestion[],
  query: SuggestionQuery,
  threshold: number,
): SuggestionResponse {
  const unique = new Map<string, SearchSuggestion>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.score) || candidate.score < threshold)
      continue;
    const text = candidate.text.trim().replace(/\s+/gu, " ");
    if (!text) continue;
    const key = `${candidate.type}:${normalizeSuggestionText(text)}`;
    const previous = unique.get(key);
    if (!previous || candidate.score > previous.score)
      unique.set(key, { ...candidate, text });
  }
  const items = [...unique.values()]
    .sort((left, right) => {
      const score = right.score - left.score;
      if (score !== 0) return score;
      const leftText = normalizeSuggestionText(left.text);
      const rightText = normalizeSuggestionText(right.text);
      if (leftText !== rightText) return leftText < rightText ? -1 : 1;
      return left.type < right.type ? -1 : left.type === right.type ? 0 : 1;
    })
    .slice(0, query.limit)
    .map(({ text, type }) => Object.freeze({ text, type }));
  return Object.freeze({ items: Object.freeze(items) });
}
