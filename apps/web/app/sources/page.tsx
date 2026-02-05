import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SourcesClient } from "./SourcesClient.js";

export default async function SourcesPage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Home
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Document Sources</h1>
          <p className="mt-1 text-gray-600">
            Browse all documents indexed in the knowledge base.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <SourcesClient />
      </main>

      <footer className="border-t border-gray-200 mt-16">
        <div className="mx-auto max-w-6xl px-6 py-6 text-sm text-gray-500">
          This tool provides educational information only and does not
          constitute legal advice.
        </div>
      </footer>
    </div>
  );
}
