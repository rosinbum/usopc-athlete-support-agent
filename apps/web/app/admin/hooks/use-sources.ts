import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { SourceConfig } from "@usopc/shared";
import { fetcher, mutationFetcher } from "./fetcher.js";

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

interface SourcesResponse {
  sources: SourceConfig[];
}

export function useSources() {
  const { data, error, isLoading, mutate } = useSWR<SourcesResponse>(
    "/api/admin/sources",
    fetcher,
  );

  return {
    sources: data?.sources ?? [],
    isLoading,
    error,
    mutate,
  };
}

interface SourceResponse {
  source: SourceConfig;
  chunkCount: number;
}

export function useSource(id: string | null) {
  const key = id ? `/api/admin/sources/${id}` : null;

  const { data, error, isLoading, mutate } = useSWR<SourceResponse>(
    key,
    fetcher,
  );

  return {
    source: data?.source ?? null,
    chunkCount: data?.chunkCount ?? 0,
    isLoading,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useSourceAction(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/admin/sources/${id}`,
    (url: string, { arg }: { arg: Record<string, unknown> }) =>
      mutationFetcher<SourceResponse>(url, {
        arg: { method: "PATCH", body: arg },
      }),
    { revalidate: false },
  );

  return { trigger, isMutating, error };
}

export function useSourceDelete(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/admin/sources/${id}`,
    (url: string) => mutationFetcher<void>(url, { arg: { method: "DELETE" } }),
    { revalidate: false },
  );

  return { trigger, isMutating, error };
}

interface IngestResponse {
  message?: string;
}

export function useSourceIngest(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/admin/sources/${id}/ingest`,
    (url: string) =>
      mutationFetcher<IngestResponse>(url, { arg: { method: "POST" } }),
  );

  return { trigger, isMutating, error };
}

interface BulkSourceActionArg {
  action: "enable" | "disable" | "ingest" | "delete";
  ids: string[];
}

export function useBulkSourceAction() {
  const { trigger, isMutating, error } = useSWRMutation(
    "/api/admin/sources/bulk",
    (url: string, { arg }: { arg: BulkSourceActionArg }) =>
      mutationFetcher<void>(url, {
        arg: { method: "POST", body: arg },
      }),
  );

  return { trigger, isMutating, error };
}
