"use client";

import { useState } from "react";

type FormStatus =
  | "idle"
  | "submitting"
  | "success"
  | "already_requested"
  | "error";

export function AccessRequestForm() {
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMessage("");

    const form = e.currentTarget;
    const data = {
      name: (form.elements.namedItem("name") as HTMLInputElement).value.trim(),
      email: (
        form.elements.namedItem("email") as HTMLInputElement
      ).value.trim(),
      sport:
        (form.elements.namedItem("sport") as HTMLInputElement).value.trim() ||
        undefined,
      role:
        (form.elements.namedItem("role") as HTMLSelectElement).value ||
        undefined,
    };

    try {
      const res = await fetch("/api/access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(
          result.error ?? "Something went wrong. Please try again.",
        );
        return;
      }

      if (result.status === "already_requested") {
        setStatus("already_requested");
      } else {
        setStatus("success");
      }
    } catch {
      setStatus("error");
      setErrorMessage(
        "Network error. Please check your connection and try again.",
      );
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="font-semibold text-green-800">Request submitted!</p>
        <p className="mt-1 text-sm text-green-700">
          We&apos;ll review your request and send an invite to your email.
        </p>
      </div>
    );
  }

  if (status === "already_requested") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="font-semibold text-amber-800">Already requested</p>
        <p className="mt-1 text-sm text-amber-700">
          We already have a request on file for this email. We&apos;ll be in
          touch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {status === "error" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div>
        <label
          htmlFor="access-name"
          className="block text-sm font-medium text-usopc-gray-700 mb-1"
        >
          Full name <span className="text-usopc-red">*</span>
        </label>
        <input
          id="access-name"
          name="name"
          type="text"
          required
          placeholder="Jane Doe"
          className="w-full border border-usopc-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-usopc-navy"
        />
      </div>

      <div>
        <label
          htmlFor="access-email"
          className="block text-sm font-medium text-usopc-gray-700 mb-1"
        >
          Email <span className="text-usopc-red">*</span>
        </label>
        <input
          id="access-email"
          name="email"
          type="email"
          required
          placeholder="jane@example.com"
          className="w-full border border-usopc-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-usopc-navy"
        />
      </div>

      <div>
        <label
          htmlFor="access-sport"
          className="block text-sm font-medium text-usopc-gray-700 mb-1"
        >
          Sport{" "}
          <span className="text-usopc-gray-500 font-normal">(optional)</span>
        </label>
        <input
          id="access-sport"
          name="sport"
          type="text"
          placeholder="e.g. Swimming, Track & Field"
          className="w-full border border-usopc-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-usopc-navy"
        />
      </div>

      <div>
        <label
          htmlFor="access-role"
          className="block text-sm font-medium text-usopc-gray-700 mb-1"
        >
          Role{" "}
          <span className="text-usopc-gray-500 font-normal">(optional)</span>
        </label>
        <select
          id="access-role"
          name="role"
          className="w-full border border-usopc-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-usopc-navy"
          defaultValue=""
        >
          <option value="">Select a role...</option>
          <option value="Athlete">Athlete</option>
          <option value="Coach">Coach</option>
          <option value="Administrator">Administrator</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full bg-usopc-red text-white rounded-md px-4 py-2.5 text-sm font-semibold hover:bg-usopc-red-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === "submitting" ? "Submitting..." : "Submit Request"}
      </button>
    </form>
  );
}
