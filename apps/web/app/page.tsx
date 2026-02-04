import Link from "next/link";
import {
  Trophy,
  Scale,
  ShieldAlert,
  FlaskConical,
  CheckCircle,
  Building2,
  Users,
} from "lucide-react";

const categories = [
  {
    id: "team_selection",
    title: "Team Selection",
    description:
      "Selection procedures, qualification criteria, Olympic Trials, and roster decisions",
    icon: Trophy,
  },
  {
    id: "dispute_resolution",
    title: "Dispute Resolution",
    description:
      "Section 9 arbitration, grievance procedures, appeals, and athlete protections",
    icon: Scale,
  },
  {
    id: "safesport",
    title: "SafeSport",
    description:
      "Abuse prevention and response, misconduct reporting, and athlete safety",
    icon: ShieldAlert,
  },
  {
    id: "anti_doping",
    title: "Anti-Doping",
    description:
      "USADA testing, TUEs, whereabouts, prohibited substances, and results management",
    icon: FlaskConical,
  },
  {
    id: "eligibility",
    title: "Eligibility",
    description:
      "Citizenship requirements, age limits, qualification standards, and classification",
    icon: CheckCircle,
  },
  {
    id: "governance",
    title: "Governance",
    description:
      "USOPC and NGB structure, bylaws, certification, and organizational obligations",
    icon: Building2,
  },
  {
    id: "athlete_rights",
    title: "Athlete Rights",
    description:
      "Representation, Athletes' Commission, marketing rights, and the Athlete Bill of Rights",
    icon: Users,
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900">
            USOPC Athlete Support
          </h1>
          <p className="mt-1 text-gray-600">
            AI-powered assistance for U.S. Olympic and Paralympic athletes
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="mb-12">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            How can we help?
          </h2>
          <p className="text-gray-600 mb-6">
            Get answers about governance, team selection, dispute resolution,
            SafeSport, anti-doping, eligibility, and athlete rights across all
            National Governing Bodies and USOPC-managed sports.
          </p>
          <div className="flex gap-4">
            <Link
              href="/chat"
              className="inline-flex items-center rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 transition-colors"
            >
              Start Chat
            </Link>
            <Link
              href="/sources"
              className="inline-flex items-center rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              View Sources
            </Link>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Topic Areas
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <Link
                  key={cat.id}
                  href={`/chat?topic=${cat.id}`}
                  className="border border-gray-200 rounded-lg p-5 hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Icon className="w-5 h-5 text-blue-600" />
                    <h3 className="font-medium text-gray-900">{cat.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{cat.description}</p>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-200 mt-16">
        <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-gray-500">
          This tool provides educational information only and does not
          constitute legal advice. For urgent safety concerns, contact the{" "}
          <a
            href="https://uscenterforsafesport.org"
            className="underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            U.S. Center for SafeSport
          </a>{" "}
          or call 911.
        </div>
      </footer>
    </div>
  );
}
