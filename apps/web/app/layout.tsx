import type { Metadata } from "next";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const metadata: Metadata = {
  title: "USOPC Athlete Support",
  description:
    "AI-powered support for U.S. Olympic and Paralympic athletes - governance, team selection, dispute resolution, SafeSport, anti-doping, eligibility, and athlete rights.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
