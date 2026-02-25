import { Resource } from "sst";

interface AppResources {
  AppTable: { name: string };
  AuthTable: { name: string };
  IngestionQueue: { url: string };
  DiscoveryFeedQueue: { url: string };
  DocumentsBucket: { name: string };
}

/**
 * Type-safe accessor for SST Resource bindings.
 *
 * Replaces scattered `Resource as unknown as { ... }` casts with a single
 * validated helper that throws a clear error when a resource is missing.
 */
export function getResource<K extends keyof AppResources>(
  key: K,
): AppResources[K] {
  const r = (Resource as unknown as Partial<AppResources>)[key];
  if (!r) throw new Error(`SST Resource '${key}' not available`);
  return r;
}
