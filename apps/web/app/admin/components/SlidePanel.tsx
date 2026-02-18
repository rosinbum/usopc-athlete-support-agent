"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface SlidePanelProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SlidePanel({ open, onClose, children }: SlidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus panel on open and lock body scroll
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [open]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-300 ${
        open
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        data-testid="slide-panel-backdrop"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        className={`absolute top-0 right-0 h-full w-full max-w-2xl bg-white shadow-xl outline-none transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 z-10"
          aria-label="Close panel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Scrollable content */}
        <div className="h-full overflow-y-auto p-6 pt-14">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
