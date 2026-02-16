import { Suspense } from "react";
import { DiscoveriesAdminClient } from "./DiscoveriesAdminClient.js";

export default function AdminDiscoveriesPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Source Discovery Review</h1>
      <p className="text-gray-600 mb-8">
        Review, approve, or reject automatically discovered sources.
      </p>
      <Suspense>
        <DiscoveriesAdminClient />
      </Suspense>
    </>
  );
}
