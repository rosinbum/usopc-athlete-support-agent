import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { DiscoveredSource, DiscoveryStatus } from "@usopc/shared";
import { fetcher, mutationFetcher } from "./fetcher.js";

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

interface DiscoveriesResponse {
  discoveries: DiscoveredSource[];
  hasMore?: boolean;
}

export function useDiscoveries(status?: DiscoveryStatus | "") {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  const key = `/api/admin/discoveries${qs ? `?${qs}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<DiscoveriesResponse>(
    key,
    fetcher,
  );

  return {
    discoveries: data?.discoveries ?? [],
    hasMore: data?.hasMore ?? false,
    isLoading,
    error,
    mutate,
  };
}

interface DiscoveryResponse {
  discovery: DiscoveredSource;
}

export function useDiscovery(id: string | null) {
  const key = id ? `/api/admin/discoveries/${id}` : null;

  const { data, error, isLoading, mutate } = useSWR<DiscoveryResponse>(
    key,
    fetcher,
  );

  return {
    discovery: data?.discovery ?? null,
    isLoading,
    error,
    mutate,
  };
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

interface DiscoveryActionArg {
  action: "approve" | "reject" | "send_to_sources" | "reprocess";
  reason?: string;
}

export function useDiscoveryAction(id: string) {
  const { trigger, isMutating, error } = useSWRMutation(
    `/api/admin/discoveries/${id}`,
    (url: string, { arg }: { arg: DiscoveryActionArg }) =>
      mutationFetcher<DiscoveryResponse>(url, {
        arg: { method: "PATCH", body: arg },
      }),
    { revalidate: false },
  );

  return { trigger, isMutating, error };
}

interface BulkDiscoveryActionArg {
  action:
    | "approve"
    | "reject"
    | "send_to_sources"
    | "reprocess"
    | "reprocess_stuck";
  ids?: string[] | undefined;
  reason?: string | undefined;
  erroredOnly?: boolean | undefined;
  olderThanMinutes?: number | undefined;
}

interface BulkDiscoveryResponse {
  created?: number;
  alreadyLinked?: number;
  duplicateUrl?: number;
  notApproved?: number;
  failed?: number;
  queued?: number;
  skipped?: number;
  found?: number;
  olderThanMinutes?: number;
}

export function useBulkDiscoveryAction() {
  const { trigger, isMutating, error } = useSWRMutation(
    "/api/admin/discoveries/bulk",
    (url: string, { arg }: { arg: BulkDiscoveryActionArg }) =>
      mutationFetcher<BulkDiscoveryResponse>(url, {
        arg: { method: "POST", body: arg },
      }),
  );

  return { trigger, isMutating, error };
}

// ---------------------------------------------------------------------------
// Discovery run hook
// ---------------------------------------------------------------------------

interface RunDiscoveryResponse {
  success: boolean;
  discovered: number;
  enqueued: number;
  skipped: number;
  errors: number;
}

export function useRunDiscovery() {
  const { trigger, isMutating, data, error } = useSWRMutation(
    "/api/admin/discovery/run",
    (url: string) =>
      mutationFetcher<RunDiscoveryResponse>(url, {
        arg: { method: "POST" },
      }),
  );

  return { trigger, isMutating, data, error };
}
