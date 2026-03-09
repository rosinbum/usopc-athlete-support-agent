import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

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
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-white text-usopc-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
