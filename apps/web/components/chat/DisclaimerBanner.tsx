"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

export function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2 flex items-start gap-2 text-xs sm:text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="flex-1">
        Educational information only — not legal advice. For urgent safety
        concerns, contact the{" "}
        <a
          href="https://uscenterforsafesport.org"
          className="underline font-medium"
          target="_blank"
          rel="noopener noreferrer"
        >
          U.S. Center for SafeSport
        </a>{" "}
        or call 911.
      </p>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 mt-0.5 text-amber-600 hover:text-amber-800"
        aria-label="Dismiss disclaimer"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
