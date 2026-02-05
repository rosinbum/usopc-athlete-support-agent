export default function AdminPage() {
  return (
    <>
      <h1 className="text-2xl font-bold mb-6">Document Ingestion Dashboard</h1>
      <p className="text-gray-600 mb-8">
        Monitor document ingestion status across all sport organizations.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Total Documents</p>
          <p className="text-3xl font-bold mt-1">&mdash;</p>
        </div>
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Organizations Indexed</p>
          <p className="text-3xl font-bold mt-1">&mdash;</p>
        </div>
        <div className="border rounded-lg p-6">
          <p className="text-sm text-gray-500">Last Ingestion</p>
          <p className="text-3xl font-bold mt-1">&mdash;</p>
        </div>
      </div>

      <div className="border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Ingestion Status</h2>
        <p className="text-gray-500 text-sm">
          Connect to database to view ingestion status.
        </p>
      </div>
    </>
  );
}
