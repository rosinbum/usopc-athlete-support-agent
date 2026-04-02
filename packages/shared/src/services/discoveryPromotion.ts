import type { DiscoveredSource } from "../entities/DiscoveredSourceEntity.js";
import type { DiscoveredSourceEntity } from "../entities/DiscoveredSourceEntity.js";
import type {
  SourceConfig,
  SourceConfigEntity,
} from "../entities/SourceConfigEntity.js";
import type { AuthorityLevel } from "../validation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SendToSourcesResult {
  discoveryId: string;
  sourceConfigId?: string;
  /** The created SourceConfig — only present when status is "created". */
  sourceConfig?: SourceConfig;
  status:
    | "created"
    | "already_linked"
    | "not_approved"
    | "duplicate_url"
    | "failed";
  error?: string;
}

export interface SendToSourcesOptions {
  /** Pre-fetched source configs to avoid repeated getAll() calls in bulk operations. */
  existingSources?: { id: string; url: string }[];
}

// ---------------------------------------------------------------------------
// sendDiscoveryToSources
// ---------------------------------------------------------------------------

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
    const existingById = await sourceConfigEntity.getById(discovery.id);
    if (existingById) {
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

    const allSources =
      options?.existingSources ?? (await sourceConfigEntity.getAll());
    const existingByUrl = allSources.find((s) => s.url === discovery.url);
    if (existingByUrl) {
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
      sourceConfig,
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
