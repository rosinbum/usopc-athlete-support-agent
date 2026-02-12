import { EditSourceClient } from "./EditSourceClient.js";

export default async function EditSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditSourceClient id={id} />;
}
