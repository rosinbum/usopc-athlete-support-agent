import { MonitoringAdminClient } from "../../components/admin/monitoring/MonitoringAdminClient.js";

export default function AdminMonitoringPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Monitoring</h1>
      <p className="text-gray-600 mb-8">
        System status, queue depths, discovery pipeline, and recent ingestion
        activity.
      </p>
      <MonitoringAdminClient />
    </>
  );
}
