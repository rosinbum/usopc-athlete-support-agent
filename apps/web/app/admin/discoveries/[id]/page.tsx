import { DiscoveryDetailClient } from "./DiscoveryDetailClient.js";

export default async function AdminDiscoveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiscoveryDetailClient id={id} />;
}
