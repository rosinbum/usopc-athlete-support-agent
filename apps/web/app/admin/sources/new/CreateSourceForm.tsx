"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { SourceForm, type SourceFormValues } from "../components/SourceForm.js";

export function CreateSourceForm() {
  const [apiError, setApiError] = useState<string | null>(null);

  async function handleSubmit(values: SourceFormValues) {
    setApiError(null);

    const body = {
      ...values,
      ngbId: values.ngbId || null,
    };

    const res = await fetch("/api/admin/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.status === 201) {
      const data = await res.json();
      window.location.href = `/admin/sources/${data.source.id}`;
      return;
    }

    const data = await res.json();
    if (res.status === 409) {
      setApiError("A source with this ID already exists");
    } else {
      setApiError(data.error || "Failed to create source");
    }
  }

  return (
    <div>
      <a
        href="/admin/sources"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Sources
      </a>

      <SourceForm
        idEditable={true}
        submitLabel="Create Source"
        onSubmit={handleSubmit}
        apiError={apiError}
      />
    </div>
  );
}
