import { AdminDashboardStats } from "./AdminDashboardStats.js";

export default function AdminPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Document Ingestion Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Monitor document ingestion status across all sport organizations.
      </p>

      <AdminDashboardStats />

      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Ingestion Status</h2>
        <p className="text-gray-500 text-sm">
          Visit the{" "}
          <a
            href="/admin/sources"
            className="text-blue-600 hover:text-blue-800"
          >
            Sources page
          </a>{" "}
          to view and manage source configurations.
        </p>
      </div>
    </>
  );
}
