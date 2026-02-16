import type { DiscoveredSource, AuthorityLevel } from "@usopc/shared";
import type { SourceConfigEntity } from "@usopc/shared";
import type { DiscoveredSourceEntity } from "@usopc/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendToSourcesResult {
  discoveryId: string;
  sourceConfigId?: string;
  status:
    | "created"
    | "already_linked"
    | "not_approved"
    | "duplicate_url"
    | "failed";
  error?: string;
}

// ---------------------------------------------------------------------------
// sendDiscoveryToSources
// ---------------------------------------------------------------------------

export interface SendToSourcesOptions {
  /** Pre-fetched source configs to avoid repeated getAll() calls in bulk operations. */
  existingSources?: { id: string; url: string }[];
}

export async function sendDiscoveryToSources(
  discovery: DiscoveredSource,
  sourceConfigEntity: SourceConfigEntity,
  discoveredSourceEntity: DiscoveredSourceEntity,
  options?: SendToSourcesOptions,
): Promise<SendToSourcesResult> {
  if (discovery.status !== "approved") {
    return { discoveryId: discovery.id, status: "not_approved" };
  }

  if (discovery.sourceConfigId) {
    return {
      discoveryId: discovery.id,
      sourceConfigId: discovery.sourceConfigId,
      status: "already_linked",
    };
  }

  try {
    // Check if a SourceConfig already exists with this ID
    const existingById = await sourceConfigEntity.getById(discovery.id);
    if (existingById) {
      // Link the discovery to the existing source and treat as already_linked
      await discoveredSourceEntity.linkToSourceConfig(
        discovery.id,
        existingById.id,
      );
      return {
        discoveryId: discovery.id,
        sourceConfigId: existingById.id,
        status: "already_linked",
      };
    }

    // Check if a SourceConfig already exists with the same URL
    const allSources =
      options?.existingSources ?? (await sourceConfigEntity.getAll());
    const existingByUrl = allSources.find((s) => s.url === discovery.url);
    if (existingByUrl) {
      // Link the discovery to the existing source
      await discoveredSourceEntity.linkToSourceConfig(
        discovery.id,
        existingByUrl.id,
      );
      return {
        discoveryId: discovery.id,
        sourceConfigId: existingByUrl.id,
        status: "duplicate_url",
      };
    }

    const sourceConfig = await sourceConfigEntity.create({
      id: discovery.id,
      title: discovery.title,
      documentType: discovery.documentType ?? "Unknown",
      topicDomains: discovery.topicDomains,
      url: discovery.url,
      format: discovery.format ?? "html",
      ngbId: discovery.ngbId ?? null,
      priority: discovery.priority ?? "medium",
      description: discovery.description ?? "",
      authorityLevel:
        (discovery.authorityLevel as AuthorityLevel) ?? "educational_guidance",
    });

    await discoveredSourceEntity.linkToSourceConfig(
      discovery.id,
      sourceConfig.id,
    );

    return {
      discoveryId: discovery.id,
      sourceConfigId: sourceConfig.id,
      status: "created",
    };
  } catch (err) {
    return {
      discoveryId: discovery.id,
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
