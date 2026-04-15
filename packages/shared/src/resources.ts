interface AppResources {
  IngestionQueue: { url: string };
  IngestionDLQ: { url: string };
  DiscoveryFeedQueue: { url: string };
  DiscoveryFeedDLQ: { url: string };
  DocumentsBucket: { name: string };
}

/**
 * Type-safe accessor for resource bindings.
 *
 * Resources are injected as environment variables — set via .env.local
 * (local dev) or Cloud Run env config (production).
 */
export function getResource<K extends keyof AppResources>(
  key: K,
): AppResources[K] {
  const envMap: Record<
    keyof AppResources,
    () => AppResources[keyof AppResources]
  > = {
    IngestionQueue: () => ({ url: process.env.INGESTION_QUEUE_URL! }),
    IngestionDLQ: () => ({ url: process.env.INGESTION_DLQ_URL! }),
    DiscoveryFeedQueue: () => ({ url: process.env.DISCOVERY_FEED_QUEUE_URL! }),
    DiscoveryFeedDLQ: () => ({ url: process.env.DISCOVERY_FEED_DLQ_URL! }),
    DocumentsBucket: () => ({ name: process.env.DOCUMENTS_BUCKET_NAME! }),
  };

  const envGetter = envMap[key];
  const value = envGetter();
  const firstProp = Object.values(value)[0];
  if (firstProp) return value as AppResources[K];

  throw new Error(`Resource '${key}' not available (check env vars)`);
}
