import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
} from "react-router";
import type { Route } from "./+types/root";
import "@fontsource-variable/inter";
import "./globals.css";
import "highlight.js/styles/github-dark.css";

export const meta: Route.MetaFunction = () => [
  { title: "USOPC Athlete Support" },
  {
    name: "description",
    content:
      "AI-powered support for U.S. Olympic and Paralympic athletes - governance, team selection, dispute resolution, SafeSport, anti-doping, eligibility, and athlete rights.",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-white text-usopc-gray-900 antialiased">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="flex items-center justify-center min-h-screen p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-usopc-navy mb-2">{message}</h1>
        <p className="text-usopc-gray-500">{details}</p>
        <a
          href="/"
          className="mt-4 inline-block text-sm text-usopc-red hover:underline"
        >
          Go back home
        </a>
      </div>
    </main>
  );
}
