import { Suspense } from "react";
import { SourcesAdminClient } from "./SourcesAdminClient.js";

export default function AdminSourcesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Source Management</h1>
      <p className="text-gray-600 mb-8">
        View, filter, and manage document source configurations.
      </p>
      <Suspense>
        <SourcesAdminClient />
      </Suspense>
    </>
  );
}
