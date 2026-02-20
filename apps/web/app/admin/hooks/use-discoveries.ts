import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { DiscoveredSource, DiscoveryStatus } from "@usopc/shared";
import { fetcher, mutationFetcher } from "./fetcher.js";

// ---------------------------------------------------------------------------
// Read hooks
// ---------------------------------------------------------------------------

interface DiscoveriesResponse {
  discoveries: DiscoveredSource[];
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
  action: "approve" | "reject" | "send_to_sources";
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
  action: "approve" | "reject" | "send_to_sources";
  ids?: string[] | undefined;
  reason?: string | undefined;
}

interface BulkDiscoveryResponse {
  created?: number;
  alreadyLinked?: number;
  duplicateUrl?: number;
  notApproved?: number;
  failed?: number;
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
