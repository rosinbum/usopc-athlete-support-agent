import { JobsAdminClient } from "./JobsAdminClient.js";

export default function AdminJobsPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Jobs & Queues</h1>
      <p className="text-gray-600 mb-8">
        Monitor background job processing, queue depths, and pipeline status.
      </p>
      <JobsAdminClient />
    </>
  );
}
