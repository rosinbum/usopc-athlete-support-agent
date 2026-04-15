"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="p-8">
      <div className="border rounded-lg p-6 border-red-200 bg-red-50">
        <h2 className="text-xl font-bold text-red-800 mb-2">
          Something went wrong in the admin panel
        </h2>
        <p className="text-sm text-red-600 mb-4">{error.message}</p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
