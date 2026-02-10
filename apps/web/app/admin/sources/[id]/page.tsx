import { SourceDetailClient } from "./SourceDetailClient.js";

export default async function AdminSourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SourceDetailClient id={id} />;
}
