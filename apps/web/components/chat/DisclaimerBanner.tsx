import { AlertTriangle } from "lucide-react";

export function DisclaimerBanner() {
  return (
    <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-2 text-sm text-amber-800">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p>
        This tool provides educational information only and does not constitute
        legal advice. For urgent safety concerns, contact the{" "}
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
    </div>
  );
}
